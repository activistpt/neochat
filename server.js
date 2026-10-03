// === Dependencies ===
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const session = require('express-session');

// === Modules ===
const cryptoModule = require('./public/crypto.js');
const wifiScanner = require('./modules/wifi-scanner.js').wifiScanner;
const gpsLocator = require('./modules/wifi-scanner.js').gpsLocator;
const { meshProtocol, NODE_TYPES, PACKET_TYPES, MeshPacket } = require('./modules/meshcore.js');

// === Configuration ===
const PORT = process.env.PORT || 3000;
const app = express();

// === Security & Middleware ===
app.use(cors({
    origin: process.env.ORIGIN || "*",
    credentials: true
}));
app.use(express.static('public'));
app.use(express.static(__dirname));
app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" }
}));
app.use(session({
    secret: process.env.SESSION_SECRET || 'neochat-secret-key-2024',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        maxAge: 24 * 60 * 60 * 1000
    }
}));

// === Data Stores ===
const channels = new Map();
const clients = new Map();

// === Helper Functions ===

// Clean up empty channels periodically
setInterval(() => {
    for (const [id, channel] of channels) {
        if (channel.clients.size === 0) {
            const age = Date.now() - new Date(channel.createdAt).getTime();
            if (age > 3600000) { // 1 hour
                channels.delete(id);
                console.log(`[CLEANUP] Removed empty channel: ${id}`);
            }
        }
    }
}, 60000);

// === HTTP API Routes ===

// Get all channels
app.get('/api/channels', (req, res) => {
    const channelList = Array.from(channels.values()).map(channel => ({
        id: channel.id || 'unknown',
        clients: channel.clients.size,
        createdAt: channel.createdAt,
        encrypted: channel.encrypted,
        private: channel.private || false
    }));
    res.json({ channels: channelList });
});

// Create new channel
app.post('/api/channels', (req, res) => {
    const { channelId, encrypted = false } = req.body;
    if (channelId && !channels.has(channelId)) {
        channels.set(channelId, {
            clients: new Set(),
            createdAt: new Date().toISOString(),
            encrypted,
            private: channelId.length > 8
        });
        res.json({ success: true, channelId });
    } else {
        const id = channelId || Array.from({length: 8}, () => 
            '0123456789abcdef'[Math.floor(Math.random() * 16)]
        ).join('');
        if (!channels.has(id)) {
            channels.set(id, {
                clients: new Set(),
                createdAt: new Date().toISOString(),
                encrypted,
                private: true
            });
        }
        res.json({ success: true, channelId: id });
    }
});

// Get channels status
app.get('/api/status', (req, res) => {
    res.json({
        status: 'online',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        channels: channels.size,
        clients: clients.size,
        version: '1.0.0',
        network: 'mesh',
        features: {
            wifi: true,
            gps: true,
            mesh: true,
            tor: true,
            encryption: true
        }
    });
});

// === WiFi Network Scanner APIs ===

// Get all public WiFi networks
app.get('/api/wifi/all', (req, res) => {
    const allNetworks = wifiScanner.getAll();
    res.json({
        count: allNetworks.length,
        networks: allNetworks
    });
});

// Scan nearby WiFi networks
app.get('/api/wifi/scan', (req, res) => {
    const lat = parseFloat(req.query.lat) || gpsLocator.getCurrentLocation().lat;
    const lng = parseFloat(req.query.lng) || gpsLocator.getCurrentLocation().lng;
    const radius = parseFloat(req.query.radius) || 10;
    
    const results = wifiScanner.scanNearby(lat, lng, radius);
    res.json({
        success: true,
        location: { lat, lng },
        radius: radius,
        results: results,
        count: results.length,
        timestamp: new Date().toISOString()
    });
});

// Search WiFi networks
app.get('/api/wifi/search', (req, res) => {
    const query = req.query.q || '';
    if (!query) {
        res.json({ success: false, message: 'Query parameter "q" required' });
        return;
    }
    const results = wifiScanner.search(query);
    res.json({
        success: true,
        query,
        results: results,
        count: results.length
    });
});

// Get WiFi networks by city
app.get('/api/wifi/city/:city', (req, res) => {
    const city = req.params.city;
    const data = wifiScanner.getByCity(city);
    if (!data) {
        res.json({ success: false, message: `City "${city}" not found` });
        return;
    }
    res.json({
        success: true,
        city: data.name,
        coordinates: { lat: data.lat, lng: data.lng },
        networks: data.networks
    });
});

// Get all cities with WiFi networks
app.get('/api/wifi/cities', (req, res) => {
    const cities = wifiScanner.getByCity();
    const result = Object.values(cities).map(city => ({
        name: city.name,
        coordinates: { lat: city.lat, lng: city.lng },
        networkCount: city.networks.length,
        firstNetwork: city.networks[0]?.ssid || 'N/A'
    }));
    res.json({
        success: true,
        cities: result.sort((a, b) => b.networkCount - a.networkCount)
    });
});

// Get WiFi networks within map bounds
app.get('/api/wifi/bounds', (req, res) => {
    const north = parseFloat(req.query.north);
    const south = parseFloat(req.query.south);
    const east = parseFloat(req.query.east);
    const west = parseFloat(req.query.west);
    
    if (!north || !south || !east || !west) {
        res.json({ success: false, message: 'Parameters: north, south, east, west required' });
        return;
    }
    
    const results = wifiScanner.getByBounds(north, south, east, west);
    res.json({
        success: true,
        bounds: { north, south, east, west },
        results: results,
        count: results.length
    });
});

// === GPS & Location APIs ===

// Get current GPS location
app.get('/api/gps/location', (req, res) => {
    const location = gpsLocator.getCurrentLocation();
    res.json({
        success: true,
        location,
        accuracy: 'simulated (browser GPS used in production)'
    });
});

// Set GPS location (for testing)
app.post('/api/gps/location', (req, res) => {
    const { lat, lng, accuracy } = req.body;
    if (lat && lng) {
        const location = gpsLocator.setLocation(lat, lng, accuracy);
        res.json({ success: true, location });
    } else {
        res.json({ success: false, message: 'lat and lng parameters required' });
    }
});

// Get Portugal continental map bounds
app.get('/api/map/portugal', (req, res) => {
    const bounds = gpsLocator.getPortugalBounds();
    const cities = gpsLocator.getMajorCities();
    res.json({
        success: true,
        bounds,
        cities,
        metadata: wifiScanner.getMetadata()
    });
});

// Get major cities in Portugal
app.get('/api/gps/cities', (req, res) => {
    const cities = gpsLocator.getMajorCities();
    res.json({
        success: true,
        cities: cities,
        country: 'Portugal (continente)'
    });
});

// Calculate distance between two cities
app.get('/api/gps/distance', (req, res) => {
    const city1Name = req.query.from;
    const city2Name = req.query.to;
    
    if (!city1Name || !city2Name) {
        res.json({ success: false, message: 'Parameters: from and to (city names) required' });
        return;
    }
    
    const cities = gpsLocator.getMajorCities();
    const city1 = cities.find(c => c.name.toLowerCase() === city1Name.toLowerCase());
    const city2 = cities.find(c => c.name.toLowerCase() === city2Name.toLowerCase());
    
    if (!city1 || !city2) {
        res.json({ success: false, message: 'One or both cities not found' });
        return;
    }
    
    const distance = gpsLocator.distance(city1, city2);
    res.json({
        success: true,
        from: city1.name,
        to: city2.name,
        distance_km: distance,
        distance_str: `${distance} km`
    });
});

// === IRC Bridge API Endpoints ===

// Get predefined IRC sources (TOR/ORBOT integration)
const ircSources = {
    'babayaga': {
        name: 'Babayaga IRC (TOR/ORBOT)',
        url: 'https://babayagairc.github.io/babayaga-irc/',
        description: 'IRC client via Tor network - Anonymous IRC over Tor',
        type: 'tor',
        tor_proxy: 'socks5://127.0.0.1:9050',
        servers: [
            { name: 'Atheme', server: 'irc.atheme.net', port: 6697, ssl: true, tor: true },
            { name: 'Libera', server: 'libera.chat', port: 6697, ssl: true, tor: true },
            { name: 'OFTC', server: 'irc.oftc.net', port: 6697, ssl: true, tor: true }
        ]
    },
    'irc-cloud': {
        name: 'IRCCloud',
        url: 'https://www.irccloud.com/',
        description: 'Web-based IRC client',
        type: 'web',
        servers: []
    }
};

app.get('/api/irc/sources', (req, res) => {
    res.json({ success: true, sources: ircSources });
});

// === MeshCore API Endpoints ===

// Get MeshCore node types
app.get('/api/mesh/types', (req, res) => {
    res.json({
        success: true,
        nodeTypes: NODE_TYPES,
        packetTypes: PACKET_TYPES
    });
});

// Register a node to MeshCore network
app.post('/api/mesh/node/join', (req, res) => {
    const { nodeId, channelId, publicKey } = req.body;
    if (!nodeId || !channelId) {
        res.json({ success: false, message: 'nodeId and channelId required' });
        return;
    }
    
    const result = meshProtocol.handleNodeJoin(nodeId, channelId, publicKey || `key_${nodeId}`);
    res.json({
        success: true,
        node: result.node,
        peers: result.peers,
        mesh: true
    });
});

// Remove node from MeshCore network
app.post('/api/mesh/node/leave', (req, res) => {
    const { nodeId, channelId } = req.body;
    if (!nodeId || !channelId) {
        res.json({ success: false, message: 'nodeId and channelId required' });
        return;
    }
    
    meshProtocol.network.unregisterNode(nodeId, channelId);
    res.json({ success: true, nodeId, mesh: true });
});

// Neighbor discovery
app.post('/api/mesh/neighbor/discover', (req, res) => {
    const { nodeId, channelId, neighbors } = req.body;
    if (!nodeId || !channelId) {
        res.json({ success: false, message: 'nodeId and channelId required' });
        return;
    }
    
    const result = meshProtocol.handleNeighborDiscovery(nodeId, channelId, neighbors || []);
    res.json({ success: true, result });
});

// Route a mesh message
app.post('/api/mesh/route', (req, res) => {
    const { packet, channelId, senderId } = req.body;
    if (!packet || !channelId || !senderId) {
        res.json({ success: false, message: 'packet, channelId, and senderId required' });
        return;
    }
    
    const result = meshProtocol.handleMessage(packet, channelId, senderId);
    res.json({ success: true, result });
});

// Broadcast a message
app.post('/api/mesh/broadcast', (req, res) => {
    const { payload, channelId, senderId, hopLimit = 5 } = req.body;
    if (!payload || !channelId || !senderId) {
        res.json({ success: false, message: 'payload, channelId, and senderId required' });
        return;
    }
    
    const packet = new MeshPacket({
        from: senderId,
        to: null,
        type: PACKET_TYPES.BROADCAST,
        payload,
        hopLimit
    });
    
    const result = meshProtocol.handleMessage(packet, channelId, senderId);
    res.json({ success: true, result });
});

// Find route between nodes
app.get('/api/mesh/route/:sourceId/:destId', (req, res) => {
    const { sourceId, destId } = req.params;
    const { channelId, maxHops } = req.query;
    
    if (!channelId) {
        res.json({ success: false, message: 'channelId query parameter required' });
        return;
    }
    
    const path = meshProtocol.network.findPath(sourceId, destId, channelId, parseInt(maxHops) || 5);
    meshProtocol.stats.routesCalculated++;
    
    res.json({
        success: path !== null,
        source: sourceId,
        destination: destId,
        path: path,
        hops: path ? path.length - 1 : 0
    });
});

// Get network topology
app.get('/api/mesh/topology/:channelId', (req, res) => {
    const { channelId } = req.params;
    const topology = meshProtocol.getTopology(channelId);
    res.json({ success: true, topology });
});

// Get routing table for a node
app.get('/api/mesh/routing-table/:nodeId', (req, res) => {
    const { nodeId } = req.params;
    const table = meshProtocol.getRoutingTable(nodeId);
    
    if (!table) {
        res.json({ success: false, message: 'Node not found' });
        return;
    }
    
    res.json({ success: true, routingTable: table });
});

// Get network statistics
app.get('/api/mesh/stats', (req, res) => {
    res.json({ success: true, stats: meshProtocol.getStats() });
});

// Create a room server node
app.post('/api/mesh/room-server', (req, res) => {
    const { roomId, channelId, publicKey } = req.body;
    const nodeId = `rs_${roomId}`;
    
    const result = meshProtocol.handleNodeJoin(nodeId, channelId, publicKey || `key_${nodeId}`);
    
    // Register as room server
    const node = meshProtocol.network.getOrCreateNode(nodeId, NODE_TYPES.ROOM_SERVER, publicKey, channelId);
    meshProtocol.network.roomServers.set(roomId, node);
    
    res.json({
        success: true,
        nodeId,
        roomId,
        type: NODE_TYPES.ROOM_SERVER,
        peers: result.peers.length
    });
});

// === Socket.IO Event Handlers ===
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: process.env.ORIGIN || "*",
        methods: ["GET", "POST"]
    }
});

io.on('connection', (socket) => {
    console.log(`[CONNECTION] Socket connected: ${socket.id}`);

    // --- Join Channel ---
    socket.on('join', (data) => {
        const { channelId, nickname, publicKey, encrypted } = data;
        
        // Join the room
        socket.join(channelId);
        socket.channelId = channelId;
        socket.nickname = nickname;
        socket.encrypted = encrypted;

        // Create channel if doesn't exist
        if (!channels.has(channelId)) {
            channels.set(channelId, {
                clients: new Set(),
                createdAt: new Date().toISOString(),
                encrypted: encrypted || false,
                private: true
            });
        }

        // Add client to channel
        clients.set(socket.id, { nickname, channelId, publicKey, encrypted });
        channels.get(channelId).clients.add(socket.id);

        // Notify others
        socket.to(channelId).emit('user-joined', {
            socketId: socket.id,
            nickname,
            publicKey: encrypted ? publicKey : null
        });

        // Send channel info to the joining user
        socket.emit('channel-info', {
            channelId,
            members: Array.from(channels.get(channelId).clients).map(id => ({
                socketId: id,
                nickname: clients.get(id)?.nickname,
                publicKey: clients.get(id)?.publicKey
            })).filter(Boolean),
            encrypted: channels.get(channelId).encrypted
        });

        console.log(`[JOIN] ${nickname} -> ${channelId}`);
    });

    // --- Send Message ---
    socket.on('message', (data) => {
        const { channelId, content, nonce, type = 'encrypted', signature } = data;
        const client = clients.get(socket.id);
        
        if (!client || client.channelId !== channelId) {
            socket.emit('error', 'Not in channel');
            return;
        }

        // Broadcast message to channel
        io.to(channelId).emit('message', {
            from: client.nickname || 'anon',
            socketId: socket.id,
            content,
            nonce,
            signature,
            type,
            timestamp: Date.now(),
            encrypted: channels.get(channelId)?.encrypted || false
        });

        console.log(`[MSG] ${channelId} < ${client.nickname}: ${type}`);
    });

    // --- IRC Bridge ---
    socket.on('irc-connect', (data) => {
        const { server, port, nickname, channel, source } = data;

        // Use predefined IRC sources (module-level ircSources, includes TOR/ORBOT Babayaga)
        // Use predefined source if specified
        let ircServer = server;
        let ircPort = port;
        let ircType = 'standard';
        let ircUrl = null;

        if (source && ircSources[source]) {
            ircServer = ircSources[source].servers?.[0]?.server || server;
            ircPort = ircSources[source].servers?.[0]?.port || port;
            ircType = ircSources[source].type;
            ircUrl = ircSources[source].url;
        }

        socket.emit('irc-status', {
            connected: true,
            server: ircServer,
            port: ircPort,
            source: source || 'custom',
            type: ircType,
            tor_url: ircUrl,
            status: 'connecting',
            message: `Connecting to IRC: ${ircServer}:${ircPort}${source ? ' via ' + ircSources[source]?.name : ''}`
        });

        // Emit to channel that user connected via IRC
        socket.to(socket.channelId).emit('irc-user-joined', {
            nickname,
            server: ircServer,
            port: ircPort,
            channel,
            source: source || 'custom',
            type: ircType,
            tor_url: ircUrl
        });
    });

    // === MeshCore Network ===
    socket.on('mesh-node-join', (data) => {
        const { nodeId, channelId, publicKey, type = NODE_TYPES.COMPANION } = data;
        const result = meshProtocol.handleNodeJoin(nodeId, channelId, publicKey);
        
        // Notify all clients in channel
        socket.to(channelId).emit('mesh-node-joined', {
            nodeId,
            channelId,
            type,
            publicKey,
            timestamp: Date.now()
        });
        
        console.log(`[MESH] Node ${nodeId} joined channel ${channelId} as ${type}`);
    });

    // --- MeshCore Neighbor Discovery ---
    socket.on('mesh-neighbor-discover', (data) => {
        const { nodeId, channelId, neighbors } = data;
        const result = meshProtocol.handleNeighborDiscovery(nodeId, channelId, neighbors || []);
        
        socket.to(channelId).emit('mesh-neighbor-update', {
            nodeId,
            neighbors: result.neighbors,
            timestamp: Date.now()
        });
        
        console.log(`[MESH] Node ${nodeId} neighbor discovery updated`);
    });

    // --- MeshCore Message ---
    socket.on('mesh-message', (data) => {
        const { packet, channelId, senderId } = data;
        const result = meshProtocol.handleMessage(packet, channelId, senderId);
        
        if (result.type === 'broadcast') {
            socket.to(channelId).emit('mesh-broadcast', {
                packetId: result.packetId,
                targets: result.targets,
                timestamp: Date.now()
            });
        } else if (result.type === 'direct') {
            socket.emit('mesh-route', {
                success: result.result !== 'error',
                result: result.result,
                packetId: result.packetId,
                timestamp: Date.now()
            });
        } else if (result.type === 'protocol') {
            socket.to(channelId).emit('mesh-protocol', {
                packet: result.packet,
                timestamp: Date.now()
            });
        }
        
        console.log(`[MESH] Message from ${senderId} to ${channelId}: ${result.type}`);
    });

    // --- MeshCore Route Request ---
    socket.on('mesh-route-request', (data) => {
        const { sourceId, destId, channelId, maxHops = 5 } = data;
        const path = meshProtocol.network.findPath(sourceId, destId, channelId, maxHops);
        meshProtocol.stats.routesCalculated++;
        
        socket.emit('mesh-route-reply', {
            success: path !== null,
            source: sourceId,
            destination: destId,
            path: path,
            hops: path ? path.length - 1 : 0,
            timestamp: Date.now()
        });
        
        console.log(`[MESH] Route request ${sourceId} -> ${destId}: ${path ? 'found' : 'not found'}`);
    });

    // --- MeshCore Disconnect ---
    socket.on('mesh-node-leave', (data) => {
        const { nodeId, channelId } = data;
        meshProtocol.network.unregisterNode(nodeId, channelId);
        
        socket.to(channelId).emit('mesh-node-left', {
            nodeId,
            channelId,
            timestamp: Date.now()
        });
        
        console.log(`[MESH] Node ${nodeId} left channel ${channelId}`);
    });

    // --- Room Server ---
    socket.on('room-server-announce', (data) => {
        const { roomId, nodeId, channelId } = data;
        meshProtocol.network.roomServers.set(roomId, meshProtocol.network.nodes.get(nodeId));
        
        socket.to(channelId).emit('room-server-online', {
            roomId,
            nodeId,
            timestamp: Date.now()
        });
        
        console.log(`[MESH] Room server ${roomId} online in channel ${channelId}`);
    });

    // --- Disconnect ---
    socket.on('disconnect', (reason) => {
        const client = clients.get(socket.id);
        if (client) {
            // Remove from channel
            const channel = channels.get(client.channelId);
            if (channel) {
                channel.clients.delete(socket.id);
            }
            clients.delete(socket.id);
            console.log(`[DISCONNECT] ${client.nickname} (${socket.id}) - ${reason}`);
        }
    });

    // --- Error Handling ---
    socket.on('error', (err) => {
        console.error('[SOCKET ERROR]', err);
    });
});

// --- Start Server ---
server.listen(PORT, () => {
    console.log(`
╔═══════════════════════════════════════════════════════════╗
║   NEOCHAT v1.0.0 - Cyberpunk Anonymous Chat Platform    ║
║   Server running on: http://localhost:${PORT}              ║
║   Channels: ${channels.size} | Clients: ${clients.size}                              ║
╚═══════════════════════════════════════════════════════════╝
    `);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('Shutting down...');
    for (const [id, channel] of channels) {
        channel.clients.clear();
    }
    channels.clear();
    clients.clear();
    server.close(() => process.exit(0));
});

module.exports = { app, io, channels, clients, wifiScanner, gpsLocator };
