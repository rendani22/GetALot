import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { jsPDF } from 'jspdf';
import { supabase } from '../supabase/supabase.client';
import { Pod } from '../models/pod.model';
import { Package } from '../models/package.model';
import { environment } from '../../../environments/environment';

/**
 * PodService handles POD (Proof of Delivery) operations.
 *
 * Key features:
 * - Create and complete POD records via Edge Functions
 * - Generate POD PDF documents
 * - Lock POD records (make immutable)
 * - All actions go through Edge Functions for audit compliance
 */
@Injectable({
  providedIn: 'root'
})
export class PodService {
  private loadingSubject = new BehaviorSubject<boolean>(false);
  private errorSubject = new BehaviorSubject<string | null>(null);

  /** Loading state */
  readonly loading$ = this.loadingSubject.asObservable();

  /** Error state */
  readonly error$ = this.errorSubject.asObservable();

  /**
   * Complete POD process: create record via Edge Function, generate PDF, lock record
   * All operations go through controlled Edge Functions for audit compliance.
   */
  async completePod(
    pkg: Package,
    signatureUrl: string,
    signaturePath: string,
    signedAt: string
  ): Promise<{ pod: Pod | null; pdfUrl: string | null; emailSent: boolean; error: string | null }> {
    this.loadingSubject.next(true);
    this.errorSubject.next(null);

    try {
      const session = await supabase.auth.getSession();
      if (!session.data.session) {
        return { pod: null, pdfUrl: null, emailSent: false, error: 'Not authenticated' };
      }

      // Step 1: Create POD record via Edge Function
      const createResponse = await fetch(
        `${environment.supabase.url}/functions/v1/complete-pod`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.data.session.access_token}`,
            'apikey': environment.supabase.anonKey
          },
          body: JSON.stringify({
            package_id: pkg.id,
            signature_url: signatureUrl,
            signature_path: signaturePath,
            signed_at: signedAt,
            notes: pkg.notes
          })
        }
      );

      const createData = await createResponse.json();

      if (!createResponse.ok) {
        const errorMessage = createData.error || createData.details || 'Failed to create POD';
        this.errorSubject.next(errorMessage);
        return { pod: null, pdfUrl: null, emailSent: false, error: errorMessage };
      }

      const pod = createData.pod as Pod;

      // Step 2: Generate and upload PDF
      const pdfResult = await this.generateAndUploadPdf(pod, pkg, signatureUrl);

      if (pdfResult.error) {
        console.warn('PDF generation failed:', pdfResult.error);
        // Continue even if PDF fails - we can regenerate later
      }

      // Step 3: Lock POD via Edge Function (this also sends the email with PDF attached)
      const lockResponse = await fetch(
        `${environment.supabase.url}/functions/v1/lock-pod`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.data.session.access_token}`,
            'apikey': environment.supabase.anonKey
          },
          body: JSON.stringify({
            pod_id: pod.id,
            pdf_url: pdfResult.url,
            pdf_path: pdfResult.path
          })
        }
      );

      const lockData = await lockResponse.json();

      if (!lockResponse.ok) {
        console.error('Failed to lock POD:', lockData.error);
        // Return the pod even if locking fails - it can be locked later
        return { pod, pdfUrl: pdfResult.url, emailSent: false, error: null };
      }

      const lockedPod = lockData.pod as Pod;
      const emailSent = lockData.email_sent === true;

      return { pod: lockedPod, pdfUrl: pdfResult.url, emailSent, error: null };

    } catch (err: any) {
      const errorMessage = err.message || 'Failed to complete POD';
      this.errorSubject.next(errorMessage);
      return { pod: null, pdfUrl: null, emailSent: false, error: errorMessage };
    } finally {
      this.loadingSubject.next(false);
    }
  }

  /**
   * Generate POD PDF and upload to storage
   */
  private async generateAndUploadPdf(
    pod: Pod,
    pkg: Package,
    signatureUrl: string
  ): Promise<{ url: string | null; path: string | null; error: string | null }> {
    try {
      // Generate PDF
      const pdfBlob = await this.generatePodPdf(pod, pkg, signatureUrl);

      // Upload to storage
      const filename = `${pod.pod_reference}/${pod.pod_reference}.pdf`;

      const { error: uploadError } = await supabase.storage
        .from('pod-documents')
        .upload(filename, pdfBlob, {
          contentType: 'application/pdf',
          cacheControl: '3600',
          upsert: true
        });

      if (uploadError) {
        return { url: null, path: null, error: uploadError.message };
      }

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('pod-documents')
        .getPublicUrl(filename);

      // Log PDF generation audit
      await this.logAudit('POD_PDF_GENERATED', pkg.id, {
        pod_id: pod.id,
        pod_reference: pod.pod_reference,
        pdf_path: filename,
        pdf_url: urlData.publicUrl
      });

      return { url: urlData.publicUrl, path: filename, error: null };

    } catch (err: any) {
      return { url: null, path: null, error: err.message || 'PDF generation failed' };
    }
  }

  /**
   * Generate the POD PDF document in traditional Delivery Note format
   */
  private async generatePodPdf(
    pod: Pod,
    pkg: Package,
    signatureUrl: string
  ): Promise<Blob> {
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 20;
    let yPos = margin;

    // Helper function to add text
    const addText = (text: string, x: number, y: number, options?: any) => {
      pdf.text(text, x, y, options);
    };

    // Format date for delivery note (date only, no time)
    const formatDate = (dateString: string): string => {
      return new Date(dateString).toLocaleDateString('en-ZA', {
        day: '2-digit',
        month: 'long',
        year: 'numeric'
      });
    };

    // ===== SECTION 1: HEADER WITH LOGO =====
    pdf.setFillColor(30, 58, 95); // #1e3a5f
    pdf.rect(0, 0, pageWidth, 40, 'F');

    // Add logo to header
    try {
      const logoUrl = 'rabelani-logo.png';
      const logoImg = await this.loadImage(logoUrl);
      // Logo dimensions - maintain aspect ratio
      const logoHeight = 18;
      const logoWidth = 38; // Approximate, adjust based on actual logo aspect ratio
      pdf.addImage(logoImg, 'PNG', margin, 6, logoWidth, logoHeight);
    } catch (err) {
      console.warn('Failed to load logo for PDF:', err);
      // Continue without logo if it fails to load
    }

    // DELIVERY NOTE title (positioned to the right of logo)
    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(22);
    pdf.setFont('helvetica', 'bold');
    addText('DELIVERY NOTE', pageWidth - margin, 15, { align: 'right' });

    // Header details row
    yPos = 32;
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'normal');

    const headerCol1 = margin + 45; // After logo
    const headerCol2 = pageWidth / 2 + 10;
    const headerCol3 = pageWidth - margin - 40;

    addText(`No: ${pod.pod_reference}`, headerCol1, yPos);
    addText(`Date: ${formatDate(pod.completed_at)}  `, headerCol2, yPos);
    if (pkg.po_number) {
      addText(`PO: ${pkg.po_number}`, headerCol3, yPos);
    }

    yPos = 50;

    // ===== SECTION 2: SUPPLIER DETAILS =====
    pdf.setTextColor(30, 58, 95);
    pdf.setFontSize(12);
    pdf.setFont('helvetica', 'bold');
    addText('From:', margin, yPos);

    yPos += 8;
    pdf.setTextColor(17, 24, 39);
    pdf.setFontSize(11);
    pdf.setFont('helvetica', 'bold');
    addText(pod.staff_name, margin, yPos);

    yPos += 5;
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(55, 65, 81);
    addText(pod.staff_email, margin, yPos);

    yPos += 15;

    // ===== SECTION 3: CUSTOMER DETAILS =====
    pdf.setDrawColor(229, 231, 235);
    pdf.setFillColor(249, 250, 251);
    pdf.roundedRect(margin, yPos, pageWidth - 2 * margin, 35, 3, 3, 'FD');

    yPos += 8;
    pdf.setTextColor(30, 58, 95);
    pdf.setFontSize(12);
    pdf.setFont('helvetica', 'bold');
    addText('To:', margin + 5, yPos);

    yPos += 7;
    pdf.setTextColor(17, 24, 39);
    pdf.setFontSize(11);
    pdf.setFont('helvetica', 'bold');
    addText(pod.receiver_email, margin + 5, yPos);

    // Delivery Location (if exists)
    if (pkg.delivery_location) {
      yPos += 6;
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(10);
      pdf.setTextColor(55, 65, 81);
      addText(pkg.delivery_location.name, margin + 5, yPos);

      if (pkg.delivery_location.address) {
        yPos += 5;
        pdf.setFontSize(9);
        const addressLines = pdf.splitTextToSize(pkg.delivery_location.address, pageWidth - 2 * margin - 15);
        pdf.text(addressLines, margin + 5, yPos);
      }
    }

    yPos += 25;

    // ===== SECTION 4: ITEM LIST =====
    pdf.setTextColor(30, 58, 95);
    pdf.setFontSize(12);
    pdf.setFont('helvetica', 'bold');
    addText('Items Delivered', margin, yPos);

    yPos += 8;
    pdf.setDrawColor(229, 231, 235);
    pdf.line(margin, yPos, pageWidth - margin, yPos);

    yPos += 5;

    // Table header
    pdf.setFillColor(243, 244, 246);
    pdf.rect(margin, yPos, pageWidth - 2 * margin, 8, 'F');

    pdf.setTextColor(55, 65, 81);
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'bold');
    yPos += 5;
    addText('Qty', margin + 5, yPos);
    addText('Description', margin + 25, yPos);

    yPos += 6;
    pdf.setDrawColor(229, 231, 235);
    pdf.line(margin, yPos, pageWidth - margin, yPos);

    yPos += 6;
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(17, 24, 39);
    pdf.setFontSize(10);

    // Render items
    if (pkg.items && pkg.items.length > 0) {
      for (const item of pkg.items) {
        addText(item.quantity.toString(), margin + 5, yPos);
        const descLines = pdf.splitTextToSize(item.description, pageWidth - margin - 50);
        pdf.text(descLines, margin + 25, yPos);
        yPos += descLines.length * 5 + 4;

        // Draw row separator
        pdf.setDrawColor(243, 244, 246);
        pdf.line(margin, yPos - 2, pageWidth - margin, yPos - 2);
      }
    } else {
      // No items - show note description if available
      pdf.setTextColor(107, 114, 128);
      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'italic');
      if (pkg.notes) {
        const notesLines = pdf.splitTextToSize(pkg.notes, pageWidth - margin - 50);
        addText('1', margin + 5, yPos);
        pdf.text(notesLines, margin + 25, yPos);
        yPos += notesLines.length * 5 + 4;
      } else {
        addText('See package for contents', margin + 25, yPos);
        yPos += 10;
      }
    }

    // Table bottom border
    pdf.setDrawColor(229, 231, 235);
    pdf.line(margin, yPos, pageWidth - margin, yPos);

    yPos += 20;

    // ===== SECTION 5: RECEIPT CONFIRMATION =====
    // Check if we need a new page for signature section
    if (yPos > pageHeight - 100) {
      pdf.addPage();
      yPos = margin;
    }

    pdf.setTextColor(30, 58, 95);
    pdf.setFontSize(12);
    pdf.setFont('helvetica', 'bold');
    addText('Receipt Confirmation', margin, yPos);

    yPos += 8;
    pdf.setDrawColor(229, 231, 235);
    pdf.line(margin, yPos, pageWidth - margin, yPos);

    yPos += 10;

    // "Received in good order" statement
    pdf.setFillColor(240, 253, 244); // Light green background
    pdf.setDrawColor(187, 247, 208); // Green border
    pdf.roundedRect(margin, yPos, pageWidth - 2 * margin, 12, 2, 2, 'FD');

    pdf.setTextColor(22, 101, 52); // Dark green text
    pdf.setFontSize(11);
    pdf.setFont('helvetica', 'bold');
    addText('Received in good order', pageWidth / 2, yPos + 8, { align: 'center' });

    yPos += 20;

    // Receiver details grid
    const col1X = margin;
    const col2X = pageWidth / 2 + 10;
    const labelWidth = 50;

    // Row 1: Receiver Name
    pdf.setTextColor(107, 114, 128);
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'normal');
    addText('Receiver Name:', col1X, yPos);
    pdf.setTextColor(17, 24, 39);
    pdf.setFont('helvetica', 'bold');
    addText(pod.receiver_email.split('@')[0], col1X + labelWidth, yPos);

    yPos += 10;

    // Row 2: Date Signed
    pdf.setTextColor(107, 114, 128);
    pdf.setFont('helvetica', 'normal');
    addText('Date Signed:', col1X, yPos);
    pdf.setTextColor(17, 24, 39);
    addText(formatDate(pod.signed_at), col1X + labelWidth, yPos);

    yPos += 15;

    // Signature
    pdf.setTextColor(107, 114, 128);
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'normal');
    addText('Signature:', col1X, yPos);

    yPos += 5;

    // Add signature image
    try {
      const signatureImg = await this.loadImage(signatureUrl);
      const sigWidth = 70;
      const sigHeight = 35;
      const sigX = col1X + labelWidth;

      pdf.addImage(signatureImg, 'PNG', sigX, yPos - 5, sigWidth, sigHeight);
      yPos += sigHeight + 5;

      // Signature underline
      pdf.setDrawColor(156, 163, 175);
      pdf.line(sigX, yPos, sigX + sigWidth, yPos);
    } catch (err) {
      console.warn('Failed to add signature to PDF:', err);
      yPos += 30;
      pdf.setTextColor(220, 38, 38);
      pdf.setFontSize(10);
      addText('Signature captured digitally', col1X + labelWidth, yPos);
      yPos += 10;
    }

    // ===== FOOTER =====
    const footerY = pageHeight - 15;

    pdf.setDrawColor(229, 231, 235);
    pdf.line(margin, footerY - 8, pageWidth - margin, footerY - 8);

    pdf.setTextColor(156, 163, 175);
    pdf.setFontSize(8);
    pdf.setFont('helvetica', 'normal');

    addText(
      `Delivery Note No: ${pod.pod_reference}`,
      pageWidth / 2,
      footerY,
      { align: 'center' }
    );

    // Return as blob
    return pdf.output('blob');
  }

  /**
   * Load an image from URL and convert to data URL
   */
  private async loadImage(url: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Failed to get canvas context'));
          return;
        }
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      };
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = url;
    });
  }

  /**
   * Get POD by package ID
   */
  async getPodByPackageId(packageId: string): Promise<{ pod: Pod | null; error: string | null }> {
    const { data, error } = await supabase
      .from('pods')
      .select('*')
      .eq('package_id', packageId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return { pod: null, error: null }; // Not found
      }
      return { pod: null, error: error.message };
    }

    return { pod: data, error: null };
  }

  /**
   * Get POD by reference
   */
  async getPodByReference(reference: string): Promise<{ pod: Pod | null; error: string | null }> {
    const { data, error } = await supabase
      .from('pods')
      .select('*')
      .eq('pod_reference', reference.toUpperCase())
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return { pod: null, error: null };
      }
      return { pod: null, error: error.message };
    }

    return { pod: data, error: null };
  }

  /**
   * Format date/time for display
   */
  private formatDateTime(dateString: string): string {
    return new Date(dateString).toLocaleString('en-ZA', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  }

  /**
   * Log audit event
   */
  private async logAudit(action: string, entityId: string, metadata: Record<string, unknown>): Promise<void> {
    try {
      const session = await supabase.auth.getSession();
      if (!session.data.session) return;

      await fetch(
        `${environment.supabase.url}/functions/v1/log-audit`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.data.session.access_token}`,
            'apikey': environment.supabase.anonKey
          },
          body: JSON.stringify({
            action,
            entity_type: 'pod',
            entity_id: entityId,
            metadata
          })
        }
      ).catch(err => console.warn('Audit log failed:', err));
    } catch (err) {
      console.warn('Audit log error:', err);
    }
  }
}
