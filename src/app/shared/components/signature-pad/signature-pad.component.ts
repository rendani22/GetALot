import {
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnDestroy,
  AfterViewInit,
  Output,
  ViewChild,
  signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import SignaturePad from 'signature_pad';
import { supabase } from '../../../core/supabase/supabase.client';
import { environment } from '../../../../environments/environment';

/**
 * SignaturePadComponent - Touch-enabled signature capture for POD.
 *
 * Features:
 * - Touch and mouse support for signature capture
 * - Clear and undo functionality
 * - Uploads signature PNG to Supabase Storage
 * - Records POD_SIGNED audit log
 * - Responsive canvas sizing
 */
@Component({
  selector: 'app-signature-pad',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="signature-container">
      <div class="signature-header">
        <h3>{{ title }}</h3>
        <p class="signature-instruction">{{ instruction }}</p>
      </div>

      <div class="signature-canvas-wrapper" #canvasWrapper>
        <canvas
          #signatureCanvas
          class="signature-canvas"
          [class.has-signature]="!isEmpty()"
        ></canvas>
        <div class="signature-line"></div>
        @if (isEmpty()) {
          <div class="signature-placeholder">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" width="24" height="24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125" />
            </svg>
            <span>Sign here</span>
          </div>
        }
      </div>

      <div class="signature-actions">
        <button
          type="button"
          class="btn btn-secondary"
          (click)="clear()"
          [disabled]="isEmpty() || isUploading()"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" width="18" height="18">
            <path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
          </svg>
          Clear
        </button>
        <button
          type="button"
          class="btn btn-primary"
          (click)="submit()"
          [disabled]="isEmpty() || isUploading()"
        >
          @if (isUploading()) {
            <span class="spinner"></span>
            Saving...
          } @else {
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" width="18" height="18">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Confirm Signature
          }
        </button>
      </div>

      @if (error()) {
        <div class="signature-error">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" width="18" height="18">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
          <span>{{ error() }}</span>
        </div>
      }
    </div>
  `,
  styles: [`
    .signature-container {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    .signature-header {
      text-align: center;

      h3 {
        margin: 0 0 0.5rem;
        font-size: 1.125rem;
        font-weight: 600;
        color: #1e3a5f;
      }

      .signature-instruction {
        margin: 0;
        font-size: 0.875rem;
        color: #6b7280;
      }
    }

    .signature-canvas-wrapper {
      position: relative;
      background: #fafafa;
      border: 2px solid #e5e7eb;
      border-radius: 12px;
      overflow: hidden;
      touch-action: none;
    }

    .signature-canvas {
      display: block;
      width: 100%;
      height: 200px;
      cursor: crosshair;

      &.has-signature {
        background: white;
      }
    }

    .signature-line {
      position: absolute;
      bottom: 40px;
      left: 20px;
      right: 20px;
      height: 1px;
      background: #d1d5db;
      pointer-events: none;
    }

    .signature-placeholder {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.5rem;
      color: #9ca3af;
      pointer-events: none;

      span {
        font-size: 0.875rem;
      }
    }

    .signature-actions {
      display: flex;
      gap: 0.75rem;
      justify-content: center;
    }

    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      padding: 0.75rem 1.5rem;
      font-size: 0.9375rem;
      font-weight: 500;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.2s;

      &:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      &:active:not(:disabled) {
        transform: scale(0.98);
      }
    }

    .btn-primary {
      background: #10b981;
      color: white;
      flex: 1;
      max-width: 200px;

      &:hover:not(:disabled) {
        background: #059669;
      }
    }

    .btn-secondary {
      background: #f3f4f6;
      color: #374151;

      &:hover:not(:disabled) {
        background: #e5e7eb;
      }
    }

    .spinner {
      width: 18px;
      height: 18px;
      border: 2px solid rgba(255, 255, 255, 0.3);
      border-top-color: white;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .signature-error {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      padding: 0.75rem;
      background: #fef2f2;
      border-radius: 8px;
      color: #dc2626;
      font-size: 0.875rem;
    }
  `]
})
export class SignaturePadComponent implements AfterViewInit, OnDestroy {
  @ViewChild('signatureCanvas') canvasRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('canvasWrapper') wrapperRef!: ElementRef<HTMLDivElement>;

  /** Package ID for storage path and audit logging */
  @Input({ required: true }) packageId!: string;

  /** Package reference for display */
  @Input() packageReference?: string;

  /** Title displayed above signature pad */
  @Input() title = 'Digital Signature';

  /** Instruction text */
  @Input() instruction = 'Please sign below to confirm receipt of your package';

  /** Supabase storage bucket name */
  @Input() storageBucket = 'signatures';

  /** Emitted when signature is successfully uploaded */
  @Output() signed = new EventEmitter<{ url: string; path: string }>();

  /** Emitted when signature is cleared */
  @Output() cleared = new EventEmitter<void>();

  /** Emitted on error */
  @Output() errorOccurred = new EventEmitter<string>();

  isUploading = signal(false);
  error = signal<string | null>(null);

  private signaturePad: SignaturePad | null = null;
  private resizeObserver: ResizeObserver | null = null;

  ngAfterViewInit(): void {
    this.initSignaturePad();
    this.setupResizeObserver();
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
    this.signaturePad?.off();
  }

  private initSignaturePad(): void {
    const canvas = this.canvasRef.nativeElement;

    // Set canvas size to match container
    this.resizeCanvas();

    // Initialize signature pad
    this.signaturePad = new SignaturePad(canvas, {
      backgroundColor: 'rgba(255, 255, 255, 0)',
      penColor: '#1e3a5f',
      minWidth: 1,
      maxWidth: 3,
      throttle: 16,
      velocityFilterWeight: 0.7
    });
  }

  private setupResizeObserver(): void {
    this.resizeObserver = new ResizeObserver(() => {
      this.resizeCanvas();
    });
    this.resizeObserver.observe(this.wrapperRef.nativeElement);
  }

  private resizeCanvas(): void {
    const canvas = this.canvasRef.nativeElement;
    const wrapper = this.wrapperRef.nativeElement;

    // Store current signature data
    const data = this.signaturePad?.toData();

    // Resize canvas
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    canvas.width = wrapper.offsetWidth * ratio;
    canvas.height = 200 * ratio;
    canvas.style.width = `${wrapper.offsetWidth}px`;
    canvas.style.height = '200px';

    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.scale(ratio, ratio);
    }

    // Restore signature data if exists
    if (this.signaturePad && data && data.length > 0) {
      this.signaturePad.fromData(data);
    }
  }

  isEmpty(): boolean {
    return this.signaturePad?.isEmpty() ?? true;
  }

  clear(): void {
    this.signaturePad?.clear();
    this.error.set(null);
    this.cleared.emit();
  }

  async submit(): Promise<void> {
    if (this.isEmpty() || !this.signaturePad) {
      this.error.set('Please provide a signature');
      return;
    }

    this.isUploading.set(true);
    this.error.set(null);

    try {
      // Get signature as PNG blob
      const dataUrl = this.signaturePad.toDataURL('image/png');
      const blob = await this.dataURLToBlob(dataUrl);

      // Generate unique filename
      const timestamp = Date.now();
      const filename = `${this.packageId}/${timestamp}_signature.png`;

      // Upload to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from(this.storageBucket)
        .upload(filename, blob, {
          contentType: 'image/png',
          cacheControl: '3600',
          upsert: false
        });

      if (uploadError) {
        this.error.set(uploadError.message);
        this.errorOccurred.emit(uploadError.message);
        return;
      }

      // Get public URL
      const { data: urlData } = supabase.storage
        .from(this.storageBucket)
        .getPublicUrl(filename);

      const signatureUrl = urlData.publicUrl;

      // Log audit
      await this.logAudit('POD_SIGNED', {
        signature_path: filename,
        signature_url: signatureUrl,
        package_reference: this.packageReference
      });

      // Emit success
      this.signed.emit({
        url: signatureUrl,
        path: filename
      });

    } catch (err: any) {
      console.error('Signature upload error:', err);
      const errorMessage = err.message || 'Failed to save signature';
      this.error.set(errorMessage);
      this.errorOccurred.emit(errorMessage);
    } finally {
      this.isUploading.set(false);
    }
  }

  private async dataURLToBlob(dataUrl: string): Promise<Blob> {
    const response = await fetch(dataUrl);
    return response.blob();
  }

  private async logAudit(action: string, metadata: Record<string, unknown>): Promise<void> {
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
            entity_type: 'package',
            entity_id: this.packageId,
            metadata
          })
        }
      ).catch(err => console.warn('Audit log failed:', err));
    } catch (err) {
      console.warn('Audit log error:', err);
    }
  }

  /** Get signature as data URL (for preview purposes) */
  getSignatureDataUrl(): string | null {
    if (this.isEmpty()) return null;
    return this.signaturePad?.toDataURL('image/png') ?? null;
  }
}
