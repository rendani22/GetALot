import { Component, inject, OnInit, OnDestroy, signal, computed, ElementRef, ViewChild, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { supabase } from '../../../core/supabase/supabase.client';
import { Package } from '../../../core/models/package.model';
import { StaffProfile } from '../../../core/models/staff-profile.model';
import { DeliveryLocation } from '../../../core/models/delivery-location.model';
import { DriverLocationService } from '../../../core/services/driver-location.service';
import { DriverLocationWithProfile } from '../../../core/models/driver-location.model';
import * as L from 'leaflet';

/**
 * Interface for packages in transit with driver and location details
 */
interface TransitPackage {
  package: Package;
  driver: StaffProfile | null;
  deliveryLocation: DeliveryLocation | null;
}

/**
 * DriverMapComponent - Admin view to see drivers with packages in transit.
 *
 * Features:
 * - View all packages currently in transit
 * - See driver details for each package
 * - View delivery destination on Google Maps
 * - Real-time GPS tracking on interactive map
 * - Auto-refresh data every 30 seconds
 */
@Component({
  selector: 'app-driver-map',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './driver-map.component.html',
  styleUrls: ['./driver-map.component.scss']
})
export class DriverMapComponent implements OnInit, OnDestroy, AfterViewInit {
  @ViewChild('mapContainer') mapContainer!: ElementRef<HTMLDivElement>;

  private router = inject(Router);
  private driverLocationService = inject(DriverLocationService);
  private refreshInterval: ReturnType<typeof setInterval> | null = null;

  // Map
  private map: L.Map | null = null;
  private driverMarkers = new Map<string, L.Marker>();
  private destinationMarkers = new Map<string, L.Marker>();

  // State
  transitPackages = signal<TransitPackage[]>([]);
  driverLocations = signal<DriverLocationWithProfile[]>([]);
  isLoading = signal(true);
  errorMessage = signal<string | null>(null);
  lastUpdated = signal<Date | null>(null);
  showMapView = signal(true);

  // Recent threshold (ms)
  private readonly RECENT_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

  // Helper to determine if a location is recent
  isRecentLocation = (location: DriverLocationWithProfile): boolean => {
    if (!location || !location.updated_at) return false;
    const updated = new Date(location.updated_at).getTime();
    return (Date.now() - updated) <= this.RECENT_THRESHOLD_MS;
  }

  // Computed - only include recent/active driver locations
  recentDriverLocations = computed(() => this.driverLocations().filter(l => this.isRecentLocation(l)));

  // Computed
  packageCount = computed(() => this.transitPackages().length);
  uniqueDrivers = computed(() => {
    const drivers = this.transitPackages()
      .map(tp => tp.driver)
      .filter((d): d is StaffProfile => d !== null);
    return [...new Map(drivers.map(d => [d.id, d])).values()];
  });
  packagesWithoutDriver = computed(() =>
    this.transitPackages().filter(tp => !tp.driver)
  );
  hasPackagesWithoutDriver = computed(() =>
    this.transitPackages().some(tp => !tp.driver)
  );
  // Only count recent driver locations as active
  activeDriverCount = computed(() => this.recentDriverLocations().length);

  async ngOnInit(): Promise<void> {
    await this.loadTransitPackages();
    await this.loadDriverLocations();

    // Subscribe to real-time location updates
    this.driverLocationService.subscribeToLocationUpdates((locations) => {
      this.driverLocations.set(locations);
      this.updateDriverMarkersOnMap();
    });

    // Auto-refresh every 30 seconds
    this.refreshInterval = setInterval(() => {
      this.loadTransitPackages();
      this.loadDriverLocations();
    }, 30000);
  }

  ngAfterViewInit(): void {
    // Initialize map after view is ready
    setTimeout(() => this.initializeMap(), 100);
  }

  ngOnDestroy(): void {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
    }
    this.driverLocationService.unsubscribeRealtime();
    if (this.map) {
      this.map.remove();
    }
  }

  /**
   * Initialize Leaflet map
   */
  private initializeMap(): void {
    if (!this.mapContainer?.nativeElement || this.map) return;

    // Default center: South Africa
    const defaultCenter: L.LatLngExpression = [-25.7461, 28.1881];
    const defaultZoom = 10;

    this.map = L.map(this.mapContainer.nativeElement, {
      center: defaultCenter,
      zoom: defaultZoom,
      zoomControl: true
    });

    // Add OpenStreetMap tile layer
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19
    }).addTo(this.map);

    // Add markers for existing data
    this.updateDriverMarkersOnMap();
    this.updateDestinationMarkersOnMap();
  }

  /**
   * Update driver markers on the map
   */
  private updateDriverMarkersOnMap(): void {
    if (!this.map) return;

    // Only include recent locations for visual indicators
    const locations = this.driverLocations().filter(l => this.isRecentLocation(l));
    const currentDriverIds = new Set(locations.map(l => l.driver_id));

    // Remove markers for drivers no longer in the (recent) list
    this.driverMarkers.forEach((marker, driverId) => {
      if (!currentDriverIds.has(driverId)) {
        marker.remove();
        this.driverMarkers.delete(driverId);
      }
    });

    // Add or update markers for current drivers
    locations.forEach(location => {
      const existingMarker = this.driverMarkers.get(location.driver_id);
      const latLng: L.LatLngExpression = [location.latitude, location.longitude];

      if (existingMarker) {
        // Update existing marker position
        existingMarker.setLatLng(latLng);
        existingMarker.setPopupContent(this.createDriverPopupContent(location));
      } else {
        // Create new marker
        const marker = L.marker(latLng, {
          icon: this.createDriverIcon(location)
        })
          .addTo(this.map!)
          .bindPopup(this.createDriverPopupContent(location));

        this.driverMarkers.set(location.driver_id, marker);
      }
    });

    // Fit map to show all markers if there are any
    if (locations.length > 0 && this.driverMarkers.size > 0) {
      const group = L.featureGroup(Array.from(this.driverMarkers.values()));
      this.map.fitBounds(group.getBounds().pad(0.1));
    }
  }

  /**
   * Update destination markers on the map
   */
  private updateDestinationMarkersOnMap(): void {
    if (!this.map) return;

    // Clear existing destination markers
    this.destinationMarkers.forEach(marker => marker.remove());
    this.destinationMarkers.clear();

    // Add markers for delivery destinations
    this.transitPackages().forEach(tp => {
      if (tp.deliveryLocation?.google_maps_link) {
        const coords = this.extractCoordinates(tp.deliveryLocation.google_maps_link);
        if (coords) {
          const marker = L.marker([coords.lat, coords.lng], {
            icon: this.createDestinationIcon()
          })
            .addTo(this.map!)
            .bindPopup(this.createDestinationPopupContent(tp));

          this.destinationMarkers.set(tp.package.id, marker);
        }
      }
    });
  }

  /**
   * Create custom driver icon
   */
  private createDriverIcon(location: DriverLocationWithProfile): L.DivIcon {
    const driverName = location.driver?.full_name || 'Unknown';
    const initials = this.getDriverInitialsFromName(driverName);

    return L.divIcon({
      className: 'driver-marker',
      html: `
        <div class="driver-marker-container">
          <div class="driver-marker-icon">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" />
            </svg>
          </div>
          <div class="driver-marker-label">${initials}</div>
        </div>
      `,
      iconSize: [40, 50],
      iconAnchor: [20, 50],
      popupAnchor: [0, -50]
    });
  }

  /**
   * Create custom destination icon
   */
  private createDestinationIcon(): L.DivIcon {
    return L.divIcon({
      className: 'destination-marker',
      html: `
        <div class="destination-marker-container">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
            <path fill-rule="evenodd" d="M11.54 22.351l.07.04.028.016a.76.76 0 00.723 0l.028-.015.071-.041a16.975 16.975 0 001.144-.742 19.58 19.58 0 002.683-2.282c1.944-1.99 3.963-4.98 3.963-8.827a8.25 8.25 0 00-16.5 0c0 3.846 2.02 6.837 3.963 8.827a19.58 19.58 0 002.682 2.282 16.975 16.975 0 001.145.742zM12 13.5a3 3 0 100-6 3 3 0 000 6z" clip-rule="evenodd" />
          </svg>
        </div>
      `,
      iconSize: [30, 40],
      iconAnchor: [15, 40],
      popupAnchor: [0, -40]
    });
  }

  /**
   * Create popup content for driver marker
   */
  private createDriverPopupContent(location: DriverLocationWithProfile): string {
    const driver = location.driver;
    const timeAgo = this.formatTimeElapsed(location.updated_at);

    // Find packages for this driver
    const driverPackages = this.transitPackages().filter(
      tp => tp.driver?.user_id === location.user_id
    );

    return `
      <div class="driver-popup">
        <h4>${driver?.full_name || 'Unknown Driver'}</h4>
        <p class="popup-meta">${driver?.email || ''}</p>
        ${driver?.phone ? `<p class="popup-meta">📞 ${driver.phone}</p>` : ''}
        <p class="popup-time">Last updated: ${timeAgo}</p>
        ${location.speed ? `<p class="popup-speed">Speed: ${(location.speed * 3.6).toFixed(1)} km/h</p>` : ''}
        <div class="popup-packages">
          <strong>${driverPackages.length} package${driverPackages.length !== 1 ? 's' : ''} in transit</strong>
          ${driverPackages.slice(0, 3).map(tp => `<div class="popup-package">${tp.package.reference}</div>`).join('')}
          ${driverPackages.length > 3 ? `<div class="popup-more">+${driverPackages.length - 3} more</div>` : ''}
        </div>
      </div>
    `;
  }

  /**
   * Create popup content for destination marker
   */
  private createDestinationPopupContent(tp: TransitPackage): string {
    return `
      <div class="destination-popup">
        <h4>${tp.deliveryLocation?.name || 'Destination'}</h4>
        <p class="popup-address">${tp.deliveryLocation?.address || ''}</p>
        <div class="popup-package-info">
          <strong>Package: ${tp.package.reference}</strong>
          <p>Receiver: ${tp.package.receiver_email}</p>
        </div>
      </div>
    `;
  }

  /**
   * Load driver locations
   */
  async loadDriverLocations(): Promise<void> {
    const locations = await this.driverLocationService.loadAllLocations();
    this.driverLocations.set(locations);
    this.updateDriverMarkersOnMap();
  }

  /**
   * Get initials from driver name
   */
  private getDriverInitialsFromName(name: string): string {
    const words = name.split(' ');
    if (words.length >= 2) {
      return `${words[0].charAt(0)}${words[1].charAt(0)}`.toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  }

  /**
   * Toggle between map and list view
   */
  toggleView(): void {
    this.showMapView.set(!this.showMapView());
    if (this.showMapView() && this.map) {
      // Invalidate map size when showing again
      setTimeout(() => this.map?.invalidateSize(), 100);
    }
  }

  /**
   * Center map on a specific driver
   */
  centerOnDriver(driverId: string): void {
    const marker = this.driverMarkers.get(driverId);
    if (marker && this.map) {
      this.map.setView(marker.getLatLng(), 15);
      marker.openPopup();
    }
  }

  /**
   * Load all packages in transit with driver and location details
   */
  async loadTransitPackages(): Promise<void> {
    this.isLoading.set(true);
    this.errorMessage.set(null);

    try {
      // Get packages in transit
      const { data: packages, error: packagesError } = await supabase
        .from('packages')
        .select(`
          *,
          delivery_locations(*)
        `)
        .eq('status', 'in_transit')
        .order('picked_up_at', { ascending: false });

      if (packagesError) {
        throw new Error(packagesError.message);
      }

      // Get unique driver IDs
      const driverIds = [...new Set(
        (packages || [])
          .map(p => p.picked_up_by)
          .filter((id): id is string => id !== null)
      )];

      // Fetch driver profiles
      let driversMap = new Map<string, StaffProfile>();
      if (driverIds.length > 0) {
        const { data: drivers, error: driversError } = await supabase
          .from('staff_profiles')
          .select('*')
          .in('user_id', driverIds);

        if (!driversError && drivers) {
          driversMap = new Map(drivers.map(d => [d.user_id, d as StaffProfile]));
        }
      }

      // Combine data
      const transitData: TransitPackage[] = (packages || []).map(pkg => ({
        package: pkg as Package,
        driver: pkg.picked_up_by ? (driversMap.get(pkg.picked_up_by) || null) : null,
        deliveryLocation: pkg.delivery_locations as DeliveryLocation | null
      }));

      this.transitPackages.set(transitData);
      this.lastUpdated.set(new Date());

    } catch (error) {
      this.errorMessage.set(error instanceof Error ? error.message : 'Failed to load transit data');
    } finally {
      this.isLoading.set(false);
    }
  }

  /**
   * Extract coordinates from Google Maps link
   */
  extractCoordinates(googleMapsLink: string | null): { lat: number; lng: number } | null {
    if (!googleMapsLink) return null;

    // Try to extract coordinates from various Google Maps URL formats
    // Format: https://www.google.com/maps?q=-25.7461,28.2881
    // Format: https://maps.google.com/?ll=-25.7461,28.2881
    // Format: https://www.google.com/maps/place/.../@-25.7461,28.2881,17z/...

    try {
      const url = new URL(googleMapsLink);

      // Try ?q= parameter
      const q = url.searchParams.get('q');
      if (q) {
        const match = q.match(/^(-?\d+\.?\d*),(-?\d+\.?\d*)$/);
        if (match) {
          return { lat: parseFloat(match[1]), lng: parseFloat(match[2]) };
        }
      }

      // Try ?ll= parameter
      const ll = url.searchParams.get('ll');
      if (ll) {
        const match = ll.match(/^(-?\d+\.?\d*),(-?\d+\.?\d*)$/);
        if (match) {
          return { lat: parseFloat(match[1]), lng: parseFloat(match[2]) };
        }
      }

      // Try /@lat,lng format in path
      const pathMatch = googleMapsLink.match(/@(-?\d+\.?\d*),(-?\d+\.?\d*)/);
      if (pathMatch) {
        return { lat: parseFloat(pathMatch[1]), lng: parseFloat(pathMatch[2]) };
      }

    } catch {
      // Invalid URL
    }

    return null;
  }

  /**
   * Open Google Maps for a location
   */
  openGoogleMaps(link: string | null): void {
    if (link) {
      window.open(link, '_blank');
    }
  }

  /**
   * Format time elapsed since pickup
   */
  formatTimeElapsed(pickedUpAt: string | null): string {
    if (!pickedUpAt) return 'Unknown';

    const now = new Date();
    const pickup = new Date(pickedUpAt);
    const diffMs = now.getTime() - pickup.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} min${diffMins > 1 ? 's' : ''} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    return pickup.toLocaleDateString('en-ZA');
  }

  /**
   * Format pickup time
   */
  formatPickupTime(pickedUpAt: string | null): string {
    if (!pickedUpAt) return 'Unknown';
    return new Date(pickedUpAt).toLocaleString('en-ZA', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  /**
   * Refresh data manually
   */
  async refresh(): Promise<void> {
    await this.loadTransitPackages();
  }

  /**
   * Navigate back to dashboard
   */
  goBack(): void {
    this.router.navigate(['/dashboard']);
  }

  /**
   * Get initials from driver name
   */
  getDriverInitials(driver: StaffProfile | null): string {
    if (!driver) return '?';
    const words = driver.full_name.split(' ');
    if (words.length >= 2) {
      return `${words[0].charAt(0)}${words[1].charAt(0)}`.toUpperCase();
    }
    return driver.full_name.substring(0, 2).toUpperCase();
  }

  /**
   * Get packages for a specific driver
   */
  getPackagesForDriver(driver: StaffProfile): TransitPackage[] {
    return this.transitPackages().filter(tp => tp.driver?.id === driver.id);
  }
}
