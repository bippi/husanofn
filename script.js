let map;
let markers = [];
let selectedMarker = null;
let markerData = [];
let userMarker = null;
let userCircle = null;
let isTrackingLocation = false;
let watchId = null;
const NEARBY_DISTANCE = 200; // meters

function filterMarkers(searchTerm) {
  const term = searchTerm.toLowerCase();
  let visibleCount = 0;
  const locationCountEl = document.getElementById('locationCount');
  const bounds = new google.maps.LatLngBounds();

  markerData.forEach((data, index) => {
    const isMatch = data.location.name.toLowerCase().includes(term);
    data.marker.setVisible(isMatch);
    if (isMatch) {
      visibleCount++;
      bounds.extend(data.marker.getPosition());
    }
  });

  if (term.length > 0) {
    locationCountEl.textContent = `Niðurstöður: ${visibleCount}`;
    locationCountEl.classList.add('active');

    // Adjust map to fit visible markers
    if (visibleCount > 0) {
      map.fitBounds(bounds);
      // Add padding to the zoom
      setTimeout(() => {
        if (map.getZoom() > 18) {
          map.setZoom(18);
        }
      }, 500);
    }
  } else {
    locationCountEl.classList.remove('active');
    // Reset to default view
    map.setCenter({ lat: 64.3175, lng: -22.083 });
    map.setZoom(15);
  }
}

function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000; // Earth radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function findNearbyHouses(userLat, userLon) {
  const nearby = [];
  markerData.forEach((data) => {
    const distance = calculateDistance(
      userLat,
      userLon,
      data.location.location.lat,
      data.location.location.lon,
    );
    if (distance <= NEARBY_DISTANCE) {
      nearby.push({
        ...data.location,
        distance: Math.round(distance),
      });
    }
  });
  return nearby.sort((a, b) => a.distance - b.distance);
}

function displayNearbyHouses(nearby) {
  const nearbyList = document.getElementById('nearbyList');
  const nearbyItems = document.getElementById('nearbyItems');

  // Hide loader
  document.getElementById('loader').classList.remove('active');

  if (nearby.length === 0) {
    nearbyItems.innerHTML =
      '<p style="color: #999; font-size: 13px;">Engin húsanöfn nær þér</p>';
    nearbyList.classList.add('active');
    return;
  }

  nearbyItems.innerHTML = nearby
    .map(
      (house) =>
        `<div class="nearby-item" onclick="selectNearbyHouse('${house.name}')">
      ${house.name}
      <span class="nearby-distance">${house.distance}m</span>
    </div>`,
    )
    .join('');
  nearbyList.classList.add('active');
}

function selectNearbyHouse(houseName) {
  const houseData = markerData.find((d) => d.location.name === houseName);
  if (houseData) {
    google.maps.event.trigger(houseData.marker, 'click');
    // Close nearby list after selecting a house
    document.getElementById('nearbyList').classList.remove('active');
  }
}

function updateUserLocation(position) {
  const userLat = position.coords.latitude;
  const userLon = position.coords.longitude;

  // Add or update user marker
  const userLatLng = { lat: userLat, lng: userLon };

  // Custom user location marker icon
  const userIcon = {
    path: google.maps.SymbolPath.CIRCLE,
    scale: 12,
    fillColor: '#4a90e2',
    fillOpacity: 1,
    strokeColor: '#ffffff',
    strokeWeight: 3,
  };

  if (!userMarker) {
    userMarker = new google.maps.Marker({
      position: userLatLng,
      map: map,
      title: 'Þín staðsetning',
      icon: userIcon,
      zIndex: 1000,
    });

    userCircle = new google.maps.Circle({
      map: map,
      center: userLatLng,
      radius: NEARBY_DISTANCE,
      fillColor: '#4a90e2',
      fillOpacity: 0.1,
      strokeColor: '#4a90e2',
      strokeOpacity: 0.3,
      strokeWeight: 1,
    });

    // Pan to user location on first update
    map.panTo(userLatLng);
    map.setZoom(16);
  } else {
    userMarker.setPosition(userLatLng);
    userCircle.setCenter(userLatLng);
  }

  // Find and display nearby houses
  const nearby = findNearbyHouses(userLat, userLon);
  displayNearbyHouses(nearby);
}

function startLocationTracking() {
  if (navigator.geolocation) {
    // Show loader
    document.getElementById('loader').classList.add('active');
    document.getElementById('nearbyList').classList.remove('active');

    watchId = navigator.geolocation.watchPosition(
      updateUserLocation,
      (error) => {
        console.error('Geolocation error:', error);
        document.getElementById('loader').classList.remove('active');
        alert('Ekki var hæð að fá staðsetningu. Athugaðu leyfin.');
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      },
    );
    isTrackingLocation = true;
    document.getElementById('locationBtn').classList.add('active');
  }
}

function stopLocationTracking() {
  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }
  isTrackingLocation = false;
  document.getElementById('locationBtn').classList.remove('active');
  document.getElementById('nearbyList').classList.remove('active');

  if (userMarker) {
    userMarker.setMap(null);
    userMarker = null;
  }
  if (userCircle) {
    userCircle.setMap(null);
    userCircle = null;
  }
}

function loadLocations(callback) {
  fetch('locations.json')
    .then((response) => response.json())
    .then((data) => callback(data))
    .catch((error) => console.error('Error loading locations:', error));
}

function initMap(locations) {
  // Center on Akranes, Iceland
  const akranesCenter = { lat: 64.3175, lng: -22.083 };

  map = new google.maps.Map(document.getElementById('map'), {
    zoom: 15,
    center: akranesCenter,
    styles: [
      {
        featureType: 'water',
        elementType: 'geometry',
        stylers: [{ color: '#e9e9e9' }, { lightness: 17 }],
      },
      {
        featureType: 'landscape',
        elementType: 'geometry',
        stylers: [{ color: '#f3f3f3' }, { lightness: 20 }],
      },
    ],
  });

  // Create markers for each location
  locations.forEach((location) => {
    const marker = new google.maps.Marker({
      position: {
        lat: location.location.lat,
        lng: location.location.lon,
      },
      map: map,
      title: location.name,
      icon: 'http://maps.google.com/mapfiles/ms/icons/red-dot.png',
    });

    marker.addListener('click', () => {
      // Reset previous marker color
      if (selectedMarker) {
        selectedMarker.setIcon(
          'http://maps.google.com/mapfiles/ms/icons/red-dot.png',
        );
      }

      // Set new marker color to blue
      marker.setIcon('http://maps.google.com/mapfiles/ms/icons/blue-dot.png');
      selectedMarker = marker;

      // Update info panel
      document.getElementById('placeName').textContent = location.name;
      document.getElementById(
        'placeCoords',
      ).textContent = `Breiddargráða: ${location.location.lat.toFixed(
        4,
      )}, Lengdargráða: ${location.location.lon.toFixed(4)}`;

      document.getElementById('infoPanel').classList.add('active');

      // Zoom and pan to marker
      map.panTo(marker.getPosition());
      map.setZoom(17);
    });

    markers.push(marker);
    markerData.push({ location, marker });
  });

  // Update location count
  document.getElementById(
    'locationCount',
  ).textContent = `Staðsetningar: ${locations.length}`;

  // Close info panel when clicking on map
  map.addListener('click', () => {
    document.getElementById('infoPanel').classList.remove('active');
    if (selectedMarker) {
      selectedMarker.setIcon(
        'http://maps.google.com/mapfiles/ms/icons/red-dot.png',
      );
      selectedMarker = null;
    }
  });
}

// Initialize map when page loads
window.addEventListener('load', () => {
  loadLocations(initMap);
});

// Search functionality
document.getElementById('searchInput').addEventListener('input', (e) => {
  filterMarkers(e.target.value);
});

// Hide info panel when search input is focused
document.getElementById('searchInput').addEventListener('focus', () => {
  document.getElementById('infoPanel').classList.remove('active');
});

// Location tracking button
document.getElementById('locationBtn').addEventListener('click', () => {
  if (isTrackingLocation) {
    stopLocationTracking();
  } else {
    // Clear search input when starting location tracking
    document.getElementById('searchInput').value = '';
    filterMarkers('');
    startLocationTracking();
  }
});
