import {
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnDestroy,
  OnInit,
  Output,
  ViewChild,
  signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Html5Qrcode, Html5QrcodeScannerState } from 'html5-qrcode';

/**
 * QrScannerComponent - Camera-based QR code scanner for mobile devices.
 *
 * Features:
 * - Uses device camera (prefers back camera on mobile)
 * - Emits scanned data
 * - Start/stop scanning controls
 * - Error handling for camera permissions
 */
@Component({
  selector: 'app-qr-scanner',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="scanner-container">
      @if (error()) {
        <div class="scanner-error">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" width="32" height="32">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
          <p>{{ error() }}</p>
          <button class="btn btn-primary" (click)="startScanning()">Try Again</button>
        </div>
      } @else if (!isScanning()) {
        <div class="scanner-idle">
          <div class="scanner-icon">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 013.75 9.375v-4.5zM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5zM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0113.5 9.375v-4.5z" />
              <path stroke-linecap="round" stroke-linejoin="round" d="M6.75 6.75h.75v.75h-.75v-.75zM6.75 16.5h.75v.75h-.75v-.75zM16.5 6.75h.75v.75h-.75v-.75zM13.5 13.5h.75v.75h-.75v-.75zM13.5 19.5h.75v.75h-.75v-.75zM19.5 13.5h.75v.75h-.75v-.75zM19.5 19.5h.75v.75h-.75v-.75zM16.5 16.5h.75v.75h-.75v-.75z" />
            </svg>
          </div>
          <p>Position the QR code within the camera frame</p>
          <button class="btn btn-primary btn-large" (click)="startScanning()">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" width="20" height="20">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
              <path stroke-linecap="round" stroke-linejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" />
            </svg>
            Start Camera
          </button>
        </div>
      } @else {
        <div class="scanner-active">
          <div id="qr-reader" #qrReader></div>
          <div class="scanner-overlay">
            <div class="scan-region"></div>
          </div>
          <button class="btn btn-secondary stop-btn" (click)="stopScanning()">
            Stop Scanning
          </button>
        </div>
      }
    </div>
  `,
  styles: [`
    .scanner-container {
      width: 100%;
      max-width: 400px;
      margin: 0 auto;
    }

    .scanner-idle, .scanner-error {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 1rem;
      padding: 2rem;
      background: #f9fafb;
      border: 2px dashed #d1d5db;
      border-radius: 12px;
      text-align: center;

      p {
        margin: 0;
        color: #6b7280;
        font-size: 0.9375rem;
      }
    }

    .scanner-error {
      border-color: #fecaca;
      background: #fef2f2;

      svg {
        color: #dc2626;
      }

      p {
        color: #dc2626;
      }
    }

    .scanner-icon {
      width: 64px;
      height: 64px;
      background: #dbeafe;
      color: #3b82f6;
      border-radius: 16px;
      display: flex;
      align-items: center;
      justify-content: center;

      svg {
        width: 32px;
        height: 32px;
      }
    }

    .scanner-active {
      position: relative;
      border-radius: 12px;
      overflow: hidden;
      background: #000;

      #qr-reader {
        width: 100%;

        video {
          width: 100% !important;
          height: auto !important;
          border-radius: 12px;
        }
      }

      :global(#qr-reader__scan_region) {
        min-height: 300px;
      }

      :global(#qr-reader__dashboard) {
        display: none !important;
      }
    }

    .scanner-overlay {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 50px;
      display: flex;
      align-items: center;
      justify-content: center;
      pointer-events: none;
    }

    .scan-region {
      width: 200px;
      height: 200px;
      border: 3px solid #3b82f6;
      border-radius: 12px;
      box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.5);
      animation: pulse 2s ease-in-out infinite;
    }

    @keyframes pulse {
      0%, 100% { border-color: #3b82f6; }
      50% { border-color: #60a5fa; }
    }

    .stop-btn {
      width: 100%;
      border-radius: 0;
      padding: 1rem;
    }

    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      padding: 0.75rem 1.5rem;
      font-size: 1rem;
      font-weight: 500;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      transition: background 0.2s;
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

    .btn-large {
      padding: 1rem 2rem;
      font-size: 1.0625rem;
    }
  `]
})
export class QrScannerComponent implements OnInit, OnDestroy {
  @ViewChild('qrReader') qrReaderRef!: ElementRef;

  /** Emitted when a QR code is successfully scanned */
  @Output() scanned = new EventEmitter<string>();

  /** Emitted when scanning starts */
  @Output() scanStarted = new EventEmitter<void>();

  /** Emitted when scanning stops */
  @Output() scanStopped = new EventEmitter<void>();

  /** Whether to auto-start scanning on init */
  @Input() autoStart = false;

  isScanning = signal(false);
  error = signal<string | null>(null);

  private html5QrCode: Html5Qrcode | null = null;
  private readonly scannerId = 'qr-reader';

  ngOnInit(): void {
    if (this.autoStart) {
      // Delay to ensure view is ready
      setTimeout(() => this.startScanning(), 100);
    }
  }

  ngOnDestroy(): void {
    this.stopScanning();
  }

  async startScanning(): Promise<void> {
    this.error.set(null);

    // Set scanning state first to render the #qr-reader element
    this.isScanning.set(true);
    this.scanStarted.emit();

    // Wait for DOM to update with the qr-reader element
    await new Promise(resolve => setTimeout(resolve, 100));

    try {
      // Create scanner instance
      this.html5QrCode = new Html5Qrcode(this.scannerId);

      // Get available cameras
      const cameras = await Html5Qrcode.getCameras();
      if (!cameras || cameras.length === 0) {
        this.error.set('No cameras found. Please ensure camera access is allowed.');
        this.isScanning.set(false);
        return;
      }

      // Prefer back camera on mobile
      const backCamera = cameras.find(c =>
        c.label.toLowerCase().includes('back') ||
        c.label.toLowerCase().includes('rear') ||
        c.label.toLowerCase().includes('environment')
      );
      const cameraId = backCamera?.id || cameras[0].id;


      // Start scanning
      await this.html5QrCode.start(
        cameraId,
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
          aspectRatio: 1
        },
        (decodedText) => {
          // QR code scanned successfully
          this.onScanSuccess(decodedText);
        },
        () => {
          // QR scan error (ignore - this fires constantly when no QR is in view)
        }
      );

    } catch (err: any) {
      console.error('Scanner error:', err);
      this.isScanning.set(false);

      if (err.name === 'NotAllowedError') {
        this.error.set('Camera permission denied. Please allow camera access in your browser settings.');
      } else if (err.name === 'NotFoundError') {
        this.error.set('No camera found on this device.');
      } else {
        this.error.set(err.message || 'Failed to start camera. Please try again.');
      }
    }
  }

  async stopScanning(): Promise<void> {
    if (this.html5QrCode) {
      try {
        const state = this.html5QrCode.getState();
        if (state === Html5QrcodeScannerState.SCANNING) {
          await this.html5QrCode.stop();
        }
        this.html5QrCode.clear();
      } catch (err) {
        console.warn('Error stopping scanner:', err);
      }
      this.html5QrCode = null;
    }

    this.isScanning.set(false);
    this.scanStopped.emit();
  }

  private async onScanSuccess(decodedText: string): Promise<void> {
    // Stop scanning after successful scan
    await this.stopScanning();

    // Emit scanned data
    this.scanned.emit(decodedText);
  }
}
