/**
 * NEOCHAT WiFi Scanner Module
 * WiFi network discovery and GPS mapping for off-grid networking
 */

const fs = require('fs');
const path = require('path');

// Load WiFi networks database for Portugal
const wifiNetworksPath = path.join(__dirname, '..', 'public', 'wifi-networks-pt.json');

// Load the database at startup
let wifiNetworks = { networks: [], metadata: {} };
try {
    const data = fs.readFileSync(wifiNetworksPath, 'utf8');
    wifiNetworks = JSON.parse(data);
    console.log(`[WiFi Scanner] Loaded ${wifiNetworks.networks.length} public WiFi networks`);
} catch (error) {
    console.error('[WiFi Scanner] Failed to load WiFi networks database:', error.message);
}

// --- WiFi Scanner Module ---
class WiFiScanner {
    constructor(networks) {
        this.networks = new Map();
        this.scanResults = [];
        this.lastScan = null;
        
        // Initialize with known networks
        if (networks && networks.networks) {
            for (const network of networks.networks) {
                this.networks.set(network.id, network);
                this.scanResults.push(network);
            }
        }
    }
    
    // Scan for WiFi networks near a location
    scanNearby(lat, lng, radiusKm = 10) {
        const results = [];
        
        for (const network of this.networks.values()) {
            const distance = this.calculateDistance(lat, lng, network.lat, network.lng);
            
            if (distance <= radiusKm) {
                results.push({
                    ...network,
                    distance: Math.round(distance * 1000), // meters
                    signal: this.estimateSignal(distance)
                });
            }
        }
        
        // Sort by distance
        results.sort((a, b) => a.distance - b.distance);
        
        this.scanResults = results;
        this.lastScan = { lat, lng, radiusKm, timestamp: Date.now() };
        
        return results;
    }
    
    // Search for a WiFi network by name or SSID
    search(query) {
        const results = [];
        const regex = new RegExp(query, 'i');
        
        for (const network of this.networks.values()) {
            if (regex.test(network.name) || 
                regex.test(network.ssid) || 
                regex.test(network.city)) {
                results.push(network);
            }
        }
        
        return results;
    }
    
    // Get all WiFi networks grouped by city
    getByCity(city = null) {
        const cities = {};
        
        for (const network of this.networks.values()) {
            const cityKey = network.city.toLowerCase();
            if (!cities[cityKey]) {
                cities[cityKey] = {
                    name: network.city,
                    lat: network.lat,
                    lng: network.lng,
                    networks: []
                };
            }
            cities[cityKey].networks.push(network);
        }
        
        if (city) {
            return cities[city.toLowerCase()] || null;
        }
        
        return cities;
    }
    
    // Get WiFi networks within a bounding box (for map view)
    getByBounds(north, south, east, west) {
        const results = [];
        
        for (const network of this.networks.values()) {
            if (network.lat >= south && network.lat <= north &&
                network.lng >= west && network.lng <= east) {
                results.push(network);
            }
        }
        
        return results;
    }
    
    // Estimate WiFi signal strength based on distance
    estimateSignal(distance) {
        // RSSI simulation: closer = stronger signal
        const maxDistance = 5; // km
        const rssi = Math.max(-30 - (distance / maxDistance) * 70, -100);
        return Math.round(rssi);
    }
    
    // Calculate distance between two coordinates (Haversine formula)
    calculateDistance(lat1, lon1, lat2, lon2) {
        const R = 6371; // Earth radius in km
        const dLat = this.toRad(lat2 - lat1);
        const dLon = this.toRad(lon2 - lon1);
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                  Math.cos(this.toRad(lat1)) * Math.cos(this.toRad(lat2)) *
                  Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }
    
    toRad(deg) {
        return deg * (Math.PI / 180);
    }
    
    // Get metadata
    getMetadata() {
        return wifiNetworks.metadata;
    }
    
    // Get all networks
    getAll() {
        return Array.from(this.networks.values());
    }
}

// --- GPS Location Module ---
class GPSLocator {
    constructor() {
        this.lastLocation = null;
        this.accuracy = 0;
    }
    
    // Simulate GPS location (in real use, this would use actual GPS)
    getCurrentLocation() {
        if (this.lastLocation) {
            return this.lastLocation;
        }
        
        // Default location: Lisbon, Portugal
        return {
            lat: 38.7223,
            lng: -9.1393,
            accuracy: 10,
            timestamp: Date.now()
        };
    }
    
    // Set location from client
    setLocation(lat, lng, accuracy = 5) {
        this.lastLocation = {
            lat,
            lng,
            accuracy,
            timestamp: Date.now()
        };
        return this.lastLocation;
    }
    
    // Get map bounds for Portugal continental
    getPortugalBounds() {
        return {
            north: 43.0,
            south: 36.9,
            east: -6.2,
            west: -9.6,
            center: { lat: 39.5, lng: -8.2 },
            zoom: 7
        };
    }
    
    // Get major cities in Portugal
    getMajorCities() {
        return [
            { name: 'Lisbon', lat: 38.7223, lng: -9.1393, population: 5444995 },
            { name: 'Porto', lat: 41.1496, lng: -8.6109, population: 1723234 },
            { name: 'Braga', lat: 41.5493, lng: -8.4206, population: 432053 },
            { name: 'Coimbra', lat: 40.2111, lng: -8.4291, population: 238537 },
            { name: 'Faro', lat: 37.1029, lng: -7.9267, population: 159626 },
            { name: 'Évora', lat: 38.5714, lng: -7.4891, population: 58961 },
            { name: 'Castelo Branco', lat: 39.8222, lng: -7.4891, population: 51604 },
            { name: 'Aveiro', lat: 40.6405, lng: -8.6538, population: 83037 },
            { name: 'Viseu', lat: 40.6618, lng: -7.9133, population: 99527 },
            { name: 'Vila Real', lat: 41.1496, lng: -7.7805, population: 51756 },
            { name: 'Santarém', lat: 39.2267, lng: -8.6820, population: 63664 },
            { name: 'Leiria', lat: 39.7435, lng: -8.8067, population: 105808 },
            { name: 'Setúbal', lat: 38.5244, lng: -8.8882, population: 90555 },
            { name: 'Guarda', lat: 40.5375, lng: -7.2725, population: 33602 }
        ];
    }
    
    // Calculate distance between cities
    distance(city1, city2) {
        const R = 6371;
        const dLat = this.toRad(city2.lat - city1.lat);
        const dLon = this.toRad(city2.lng - city1.lng);
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                  Math.cos(this.toRad(city1.lat)) * Math.cos(this.toRad(city2.lat)) *
                  Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return Math.round(R * c);
    }
    
    toRad(deg) {
        return deg * (Math.PI / 180);
    }
}

// Create module instances
const wifiScanner = new WiFiScanner(wifiNetworks);
const gpsLocator = new GPSLocator();

module.exports = {
    wifiScanner,
    gpsLocator,
    wifiNetworks
};
