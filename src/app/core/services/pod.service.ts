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
  ): Promise<{ pod: Pod | null; pdfUrl: string | null; error: string | null }> {
    this.loadingSubject.next(true);
    this.errorSubject.next(null);

    try {
      const session = await supabase.auth.getSession();
      if (!session.data.session) {
        return { pod: null, pdfUrl: null, error: 'Not authenticated' };
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
        return { pod: null, pdfUrl: null, error: errorMessage };
      }

      const pod = createData.pod as Pod;

      // Step 2: Generate and upload PDF
      const pdfResult = await this.generateAndUploadPdf(pod, pkg, signatureUrl);

      if (pdfResult.error) {
        console.warn('PDF generation failed:', pdfResult.error);
        // Continue even if PDF fails - we can regenerate later
      }

      // Step 3: Lock POD via Edge Function
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
        return { pod, pdfUrl: pdfResult.url, error: null };
      }

      const lockedPod = lockData.pod as Pod;

      return { pod: lockedPod, pdfUrl: pdfResult.url, error: null };

    } catch (err: any) {
      const errorMessage = err.message || 'Failed to complete POD';
      this.errorSubject.next(errorMessage);
      return { pod: null, pdfUrl: null, error: errorMessage };
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
   * Generate the POD PDF document
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

    // ===== HEADER =====
    pdf.setFillColor(30, 58, 95); // #1e3a5f
    pdf.rect(0, 0, pageWidth, 40, 'F');

    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(24);
    pdf.setFont('helvetica', 'bold');
    addText('PROOF OF DELIVERY', pageWidth / 2, 18, { align: 'center' });

    pdf.setFontSize(14);
    pdf.setFont('helvetica', 'normal');
    addText(pod.pod_reference, pageWidth / 2, 30, { align: 'center' });

    yPos = 55;

    // ===== POD DETAILS BOX =====
    pdf.setDrawColor(229, 231, 235); // #e5e7eb
    pdf.setFillColor(249, 250, 251); // #f9fafb
    pdf.roundedRect(margin, yPos, pageWidth - 2 * margin, 45, 3, 3, 'FD');

    pdf.setTextColor(107, 114, 128); // #6b7280
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'normal');

    const col1X = margin + 10;
    const col2X = pageWidth / 2 + 10;
    let detailY = yPos + 12;

    // Row 1
    addText('POD Reference', col1X, detailY);
    addText('Package Reference', col2X, detailY);

    pdf.setTextColor(17, 24, 39); // #111827
    pdf.setFontSize(12);
    pdf.setFont('helvetica', 'bold');
    detailY += 6;
    addText(pod.pod_reference, col1X, detailY);
    addText(pod.package_reference, col2X, detailY);

    // Row 2
    detailY += 12;
    pdf.setTextColor(107, 114, 128);
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'normal');
    addText('Receiver Email', col1X, detailY);
    addText('Completed At', col2X, detailY);

    pdf.setTextColor(17, 24, 39);
    pdf.setFontSize(11);
    pdf.setFont('helvetica', 'normal');
    detailY += 6;
    addText(pod.receiver_email, col1X, detailY);
    addText(this.formatDateTime(pod.completed_at), col2X, detailY);

    yPos += 55;

    // ===== STAFF DETAILS =====
    yPos += 10;
    pdf.setTextColor(30, 58, 95);
    pdf.setFontSize(14);
    pdf.setFont('helvetica', 'bold');
    addText('Processed By', margin, yPos);

    yPos += 8;
    pdf.setDrawColor(229, 231, 235);
    pdf.line(margin, yPos, pageWidth - margin, yPos);

    yPos += 10;
    pdf.setTextColor(107, 114, 128);
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'normal');

    addText('Staff Name', col1X - 10, yPos);
    addText('Staff Email', col2X - 10, yPos);

    pdf.setTextColor(17, 24, 39);
    pdf.setFontSize(11);
    yPos += 6;
    addText(pod.staff_name, col1X - 10, yPos);
    addText(pod.staff_email, col2X - 10, yPos);

    yPos += 8;
    pdf.setTextColor(107, 114, 128);
    pdf.setFontSize(10);
    addText('Staff ID', col1X - 10, yPos);

    pdf.setTextColor(17, 24, 39);
    pdf.setFontSize(9);
    pdf.setFont('courier', 'normal');
    yPos += 6;
    addText(pod.staff_id, col1X - 10, yPos);

    // ===== PACKAGE NOTES =====
    if (pkg.notes) {
      yPos += 15;
      pdf.setTextColor(30, 58, 95);
      pdf.setFontSize(14);
      pdf.setFont('helvetica', 'bold');
      addText('Package Notes', margin, yPos);

      yPos += 8;
      pdf.setDrawColor(229, 231, 235);
      pdf.line(margin, yPos, pageWidth - margin, yPos);

      yPos += 8;
      pdf.setTextColor(55, 65, 81);
      pdf.setFontSize(11);
      pdf.setFont('helvetica', 'normal');

      // Word wrap notes
      const splitNotes = pdf.splitTextToSize(pkg.notes, pageWidth - 2 * margin - 10);
      pdf.text(splitNotes, margin + 5, yPos);
      yPos += splitNotes.length * 5;
    }

    // ===== SIGNATURE =====
    yPos += 15;
    pdf.setTextColor(30, 58, 95);
    pdf.setFontSize(14);
    pdf.setFont('helvetica', 'bold');
    addText('Receiver Signature', margin, yPos);

    yPos += 8;
    pdf.setDrawColor(229, 231, 235);
    pdf.line(margin, yPos, pageWidth - margin, yPos);

    yPos += 10;

    // Add signature image
    try {
      const signatureImg = await this.loadImage(signatureUrl);
      const sigWidth = 80;
      const sigHeight = 40;
      const sigX = (pageWidth - sigWidth) / 2;

      pdf.addImage(signatureImg, 'PNG', sigX, yPos, sigWidth, sigHeight);
      yPos += sigHeight + 5;

      // Signature line
      pdf.setDrawColor(156, 163, 175);
      pdf.line(sigX, yPos, sigX + sigWidth, yPos);

      yPos += 5;
      pdf.setTextColor(107, 114, 128);
      pdf.setFontSize(9);
      addText(`Signed at: ${this.formatDateTime(pod.signed_at)}`, pageWidth / 2, yPos, { align: 'center' });
    } catch (err) {
      console.warn('Failed to add signature to PDF:', err);
      pdf.setTextColor(220, 38, 38);
      pdf.setFontSize(10);
      addText('Signature image unavailable', pageWidth / 2, yPos + 20, { align: 'center' });
      yPos += 40;
    }

    // ===== FOOTER =====
    const footerY = pageHeight - 20;

    pdf.setDrawColor(229, 231, 235);
    pdf.line(margin, footerY - 10, pageWidth - margin, footerY - 10);

    pdf.setTextColor(156, 163, 175);
    pdf.setFontSize(8);
    pdf.setFont('helvetica', 'normal');

    addText(
      `This document is an official Proof of Delivery record. POD Reference: ${pod.pod_reference}`,
      pageWidth / 2,
      footerY - 3,
      { align: 'center' }
    );

    addText(
      `Generated: ${this.formatDateTime(new Date().toISOString())} | Document is locked and immutable`,
      pageWidth / 2,
      footerY + 3,
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
