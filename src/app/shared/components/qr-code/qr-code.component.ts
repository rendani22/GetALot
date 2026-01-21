import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import QRCode from 'qrcode';
import { supabase } from '../../../core/supabase/supabase.client';
import { environment } from '../../../../environments/environment';

/**
 * QrCodeComponent - Generates and displays QR codes with print/download options.
 *
 * Features:
 * - Generates QR code from data string
 * - Download as PNG
 * - Print-friendly view
 * - Records QR_GENERATED audit log
 */
@Component({
  selector: 'app-qr-code',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="qr-container">
      @if (loading()) {
        <div class="qr-loading">
          <div class="spinner"></div>
          <span>Generating QR Code...</span>
        </div>
      } @else if (qrDataUrl()) {
        <div class="qr-content">
          <div class="qr-image-wrapper">
            <img [src]="qrDataUrl()" [alt]="'QR Code for ' + data" class="qr-image" />
          </div>

          @if (showReference && referenceText) {
            <div class="reference-text">{{ referenceText }}</div>
          }

          <div class="qr-actions">
            <button class="btn btn-primary" (click)="downloadQR()">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" width="18" height="18">
                <path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
              Download PNG
            </button>
            <button class="btn btn-secondary" (click)="printQR()">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" width="18" height="18">
                <path stroke-linecap="round" stroke-linejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0110.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0l.229 2.523a1.125 1.125 0 01-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0021 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 00-1.913-.247M6.34 18H5.25A2.25 2.25 0 013 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 011.913-.247m10.5 0a48.536 48.536 0 00-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18 10.5h.008v.008H18V10.5zm-3 0h.008v.008H15V10.5z" />
              </svg>
              Print
            </button>
          </div>
        </div>
      } @else if (error()) {
        <div class="qr-error">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" width="24" height="24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
          <span>{{ error() }}</span>
        </div>
      }
    </div>
  `,
  styles: [`
    .qr-container {
      display: flex;
      flex-direction: column;
      align-items: center;
    }

    .qr-loading {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 1rem;
      padding: 2rem;
      color: #6b7280;

      .spinner {
        width: 32px;
        height: 32px;
        border: 3px solid #e5e7eb;
        border-top-color: #3b82f6;
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
      }
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .qr-content {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 1rem;
    }

    .qr-image-wrapper {
      background: white;
      padding: 1rem;
      border-radius: 12px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    }

    .qr-image {
      display: block;
      width: 200px;
      height: 200px;
    }

    .reference-text {
      font-family: 'SF Mono', Monaco, 'Courier New', monospace;
      font-size: 1.125rem;
      font-weight: 600;
      color: #1e3a5f;
      text-align: center;
    }

    .qr-actions {
      display: flex;
      gap: 0.75rem;
      flex-wrap: wrap;
      justify-content: center;
    }

    .btn {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.625rem 1rem;
      font-size: 0.875rem;
      font-weight: 500;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      transition: background 0.2s;

      &:active {
        transform: scale(0.98);
      }
    }

    .btn-primary {
      background: #3b82f6;
      color: white;

      &:hover {
        background: #2563eb;
      }
    }

    .btn-secondary {
      background: #f3f4f6;
      color: #374151;

      &:hover {
        background: #e5e7eb;
      }
    }

    .qr-error {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.5rem;
      padding: 1.5rem;
      color: #dc2626;
      text-align: center;
    }
  `]
})
export class QrCodeComponent implements OnChanges {
  /** Data to encode in QR code */
  @Input({ required: true }) data!: string;

  /** Reference text to display below QR */
  @Input() referenceText?: string;

  /** Whether to show reference text */
  @Input() showReference = true;

  /** Package ID for audit logging */
  @Input() packageId?: string;

  /** Filename for download (without extension) */
  @Input() filename = 'qr-code';

  /** Emitted when QR is generated */
  @Output() generated = new EventEmitter<string>();

  /** Emitted when QR is downloaded */
  @Output() downloaded = new EventEmitter<void>();

  /** Emitted when QR is printed */
  @Output() printed = new EventEmitter<void>();

  loading = signal(false);
  qrDataUrl = signal<string | null>(null);
  error = signal<string | null>(null);

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['data'] && this.data) {
      this.generateQR();
    }
  }

  private async generateQR(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      const dataUrl = await QRCode.toDataURL(this.data, {
        width: 400,
        margin: 2,
        color: {
          dark: '#1e3a5f',
          light: '#ffffff'
        },
        errorCorrectionLevel: 'H'
      });

      this.qrDataUrl.set(dataUrl);
      this.generated.emit(dataUrl);

      // Log QR generation audit
      if (this.packageId) {
        await this.logAudit('QR_GENERATED');
      }
    } catch (err) {
      console.error('QR generation error:', err);
      this.error.set('Failed to generate QR code');
    } finally {
      this.loading.set(false);
    }
  }

  async downloadQR(): Promise<void> {
    const dataUrl = this.qrDataUrl();
    if (!dataUrl) return;

    // Create download link
    const link = document.createElement('a');
    link.download = `${this.filename}.png`;
    link.href = dataUrl;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    this.downloaded.emit();

    // Log download audit
    if (this.packageId) {
      await this.logAudit('QR_DOWNLOADED');
    }
  }

  async printQR(): Promise<void> {
    const dataUrl = this.qrDataUrl();
    if (!dataUrl) return;

    // Create print window with QR code
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Please allow pop-ups to print the QR code');
      return;
    }

    const referenceHtml = this.referenceText
      ? `<p style="font-family: 'Courier New', monospace; font-size: 24px; font-weight: bold; margin: 20px 0; color: #1e3a5f;">${this.referenceText}</p>`
      : '';

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Print QR Code - ${this.referenceText || this.data}</title>
          <style>
            body {
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              min-height: 100vh;
              margin: 0;
              font-family: Arial, sans-serif;
            }
            img {
              width: 300px;
              height: 300px;
            }
            .instructions {
              margin-top: 20px;
              font-size: 14px;
              color: #666;
              text-align: center;
            }
            @media print {
              .instructions { display: none; }
            }
          </style>
        </head>
        <body>
          <img src="${dataUrl}" alt="QR Code" />
          ${referenceHtml}
          <p class="instructions">Press Ctrl+P (Cmd+P on Mac) to print</p>
          <script>
            window.onload = function() {
              setTimeout(function() {
                window.print();
              }, 250);
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();

    this.printed.emit();

    // Log print audit
    if (this.packageId) {
      await this.logAudit('QR_PRINTED');
    }
  }

  private async logAudit(action: string): Promise<void> {
    try {
      const session = await supabase.auth.getSession();
      if (!session.data.session || !this.packageId) return;

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
            entity_type: 'package',
            entity_id: this.packageId,
            metadata: {
              reference: this.referenceText || this.data
            }
          })
        }
      ).catch(err => console.warn('Audit log failed:', err));
    } catch (err) {
      console.warn('Audit log error:', err);
    }
  }
}
