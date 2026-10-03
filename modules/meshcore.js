/**
 * NEOCHAT MeshCore Integration Module
 * Based on MeshCore (https://github.com/meshcore-dev/MeshCore)
 * 
 * Implements mesh networking concepts for NEOCHAT:
 * - Multi-hop packet routing
 * - Role-based nodes (Companion, Repeater, Room Server)
 * - Store-and-forward messaging
 * - Neighbor discovery
 * - Path calculation
 */

// --- MeshCore Node Types ---
const NODE_TYPES = {
    COMPANION: 'companion',    // Client node, no relaying
    REPEATER: 'repeater',      // Relay node, extends mesh coverage
    ROOM_SERVER: 'room_server' // Store-and-forward server for shared posts
};

// --- MeshCore Packet Types ---
const PACKET_TYPES = {
    DATA: 0x01,        // Regular data message
    ROUTING: 0x02,     // Routing protocol messages
    BROADCAST: 0x03,   // Flood broadcast for public channels
    DIRECT: 0x04,      // Direct (zero-hop) message
    ROUTE_REQUEST: 0x05,
    ROUTE_REPLY: 0x06,
    NEIGHBOR_SOLICIT: 0x07,
    NEIGHBOR_ADVERTISE: 0x08,
    STORE_FORWARD: 0x09
};

// --- Mesh Packet Structure ---
class MeshPacket {
    constructor({ from, to, via = [], type = PACKET_TYPES.DATA, payload, hopLimit = 5, qos = 0 }) {
        this.from = from;
        this.to = to;
        this.via = via;           // Route path (array of node IDs)
        this.type = type;
        this.payload = payload;
        this.hopLimit = hopLimit; // Max hops before packet expires
        this.qos = qos;           // Quality of Service
        this.timestamp = Date.now();
        this.id = this.generatePacketId();
    }
    
    generatePacketId() {
        return Math.random().toString(36).substring(2, 10) + Date.now().toString(36).slice(-6);
    }
    
    // Decrement hop limit
    decrementHop() {
        this.hopLimit--;
        return this.hopLimit > 0;
    }
    
    // Check if this packet should be forwarded
    shouldForward(currentNode) {
        // Don't forward if expired
        if (this.hopLimit <= 0) return false;
        
        // Already delivered?
        if (this.to && this.to === currentNode) return false;
        
        // Broadcast?
        if (this.type === PACKET_TYPES.BROADCAST) return true;
        
        // Has a route path and current node is in it?
        if (this.via && this.via.length > 0) {
            const currentIndex = this.via.indexOf(currentNode);
            if (currentIndex >= 0 && currentIndex < this.via.length - 1) {
                return true; // We're in the path, forward to next hop
            }
        }
        
        // If no specific route, forward if it's a routing message
        if (this.type === PACKET_TYPES.ROUTING || 
            this.type === PACKET_TYPES.NEIGHBOR_SOLICIT ||
            this.type === PACKET_TYPES.NEIGHBOR_ADVERTISE) {
            return true;
        }
        
        return false;
    }
    
    // Serialize packet for transmission
    serialize() {
        return JSON.stringify({
            id: this.id,
            from: this.from,
            to: this.to,
            via: this.via,
            type: this.type,
            payload: this.payload,
            hopLimit: this.hopLimit,
            qos: this.qos,
            timestamp: this.timestamp
        });
    }
    
    static deserialize(data) {
        const parsed = JSON.parse(typeof data === 'string' ? data : JSON.stringify(data));
        const packet = new MeshPacket(parsed);
        packet.id = parsed.id;
        packet.timestamp = parsed.timestamp;
        return packet;
    }
}

// --- Mesh Node ---
class MeshNode {
    constructor(nodeId, type = NODE_TYPES.COMPANION, publicKey = null) {
        this.nodeId = nodeId;
        this.type = type;
        this.publicKey = publicKey || `key_${nodeId}`;
        this.neighbors = new Map();  // nodeId -> { lastSeen, rssi, type }
        this.routes = new Map();     // destination -> path
        this.messageStore = [];      // Store-and-forward buffer
        this.lastSeen = Date.now();
        this.routingTable = new Map(); // nodeId -> nextHop
    }
    
    // Update neighbor
    updateNeighbor(neighborId, rssi = -50, type = null) {
        this.neighbors.set(neighborId, {
            lastSeen: Date.now(),
            rssi: rssi,
            type: type || NODE_TYPES.COMPANION
        });
    }
    
    // Add a route
    addRoute(destination, path) {
        this.routes.set(destination, {
            path,
            createdAt: Date.now(),
            expiresAt: Date.now() + 600000 // 10 min expiry
        });
    }
    
    // Store message for later delivery (store-and-forward)
    storeMessage(packet) {
        this.messageStore.push({
            packet,
            receivedAt: Date.now()
        });
        
        // Keep only last 1000 messages
        if (this.messageStore.length > 1000) {
            this.messageStore = this.messageStore.slice(-1000);
        }
    }
    
    // Get stored messages for a recipient
    getStoredMessages(recipient) {
        return this.messageStore
            .filter(m => m.packet.to === recipient || m.packet.type === PACKET_TYPES.BROADCAST)
            .map(m => m.packet);
    }
    
    // Clean up expired routes
    cleanup() {
        const now = Date.now();
        for (const [dest, route] of this.routes) {
            if (route.expiresAt < now) {
                this.routes.delete(dest);
            }
        }
        for (const [neighborId, info] of this.neighbors) {
            if (now - info.lastSeen > 300000) { // 5 min
                this.neighbors.delete(neighborId);
            }
        }
    }
}

// --- Mesh Network ---
class MeshNetwork {
    constructor() {
        this.nodes = new Map();        // nodeId -> MeshNode
        this.roomServers = new Map();  // roomId -> nodeId
        this.broadcasts = new Map();   // packetId -> { nodes: Set, receivedAt }
        this.channelPeers = new Map(); // channelId -> Set of nodeIds
    }
    
    // Register a node
    registerNode(nodeId, type = NODE_TYPES.COMPANION, publicKey = null, channelId = null) {
        const node = new MeshNode(nodeId, type, publicKey);
        this.nodes.set(nodeId, node);
        
        if (channelId) {
            if (!this.channelPeers.has(channelId)) {
                this.channelPeers.set(channelId, new Set());
            }
            this.channelPeers.get(channelId).add(nodeId);
        }
        
        if (type === NODE_TYPES.ROOM_SERVER) {
            this.roomServers.set(nodeId, node);
        }
        
        return node;
    }
    
    // Get or create node
    getOrCreateNode(nodeId, type = NODE_TYPES.COMPANION, publicKey = null, channelId = null) {
        if (this.nodes.has(nodeId)) {
            const node = this.nodes.get(nodeId);
            node.lastSeen = Date.now();
            return node;
        }
        return this.registerNode(nodeId, type, publicKey, channelId);
    }
    
    // Unregister node
    unregisterNode(nodeId, channelId = null) {
        this.nodes.delete(nodeId);
        if (channelId && this.channelPeers.has(channelId)) {
            this.channelPeers.get(channelId).delete(nodeId);
        }
    }
    
    // Get nodes in a channel
    getChannelNodes(channelId) {
        return this.channelPeers.get(channelId) || new Set();
    }
    
    // Broadcast message (flood with deduplication)
    broadcast(packet, channelId, currentNodeId) {
        // Check if this broadcast was already processed
        if (this.broadcasts.has(packet.id)) {
            const broadcast = this.broadcasts.get(packet.id);
            broadcast.nodes.add(currentNodeId);
            return [];
        }
        
        // Record this broadcast
        this.broadcasts.set(packet.id, {
            nodes: new Set([currentNodeId]),
            receivedAt: Date.now()
        });
        
        // Get all nodes in channel except sender
        const channelNodes = this.getChannelNodes(channelId);
        const targets = [];
        
        for (const nodeId of channelNodes) {
            if (nodeId !== currentNodeId) {
                targets.push({
                    nodeId,
                    packet: packet.serialize()
                });
            }
        }
        
        return targets;
    }
    
    // Route a direct message
    route(packet, channelId, currentNodeId) {
        const targetNodeId = packet.to;
        
        if (!targetNodeId) {
            return { error: 'No target node specified' };
        }
        
        // Is the target in the same channel?
        const channelNodes = this.getChannelNodes(channelId);
        if (channelNodes.has(targetNodeId)) {
            // Direct delivery
            return {
                target: targetNodeId,
                packet: packet.serialize()
            };
        }
        
        // Try routing through room server
        for (const [roomId, roomNode] of this.roomServers) {
            if (roomNode.nodeId) {
                return {
                    target: roomNode.nodeId,
                    packet: packet.serialize(),
                    forwarded: true,
                    nextHop: roomNode.nodeId
                };
            }
        }
        
        return { error: 'No route to target' };
    }
    
    // Multi-hop routing: find best path from source to destination
    findPath(sourceId, destId, channelId, maxHops = 5) {
        // BFS to find shortest path
        const visited = new Set();
        const queue = [{ nodeId: sourceId, path: [sourceId], hops: 0 }];
        visited.add(sourceId);
        
        const channelNodes = this.getChannelNodes(channelId);
        
        while (queue.length > 0) {
            const { nodeId, path, hops } = queue.shift();
            
            if (nodeId === destId) {
                return path;
            }
            
            if (hops >= maxHops) continue;
            
            const node = this.nodes.get(nodeId);
            if (!node) continue;
            
            for (const neighborId of node.neighbors.keys()) {
                if (!visited.has(neighborId) && channelNodes.has(neighborId)) {
                    visited.add(neighborId);
                    queue.push({
                        nodeId: neighborId,
                        path: [...path, neighborId],
                        hops: hops + 1
                    });
                }
            }
        }
        
        return null; // No path found
    }
    
    // Get network topology for visualization
    getTopology(channelId = null) {
        const nodes = [];
        const edges = [];
        
        const channelNodes = channelId 
            ? this.getChannelNodes(channelId) 
            : new Set(this.nodes.keys());
        
        for (const nodeId of channelNodes) {
            const node = this.nodes.get(nodeId);
            if (node) {
                nodes.push({
                    id: node.nodeId,
                    type: node.type,
                    publicKey: node.publicKey,
                    neighborCount: node.neighbors.size,
                    routes: node.routes.size,
                    storedMessages: node.messageStore.length,
                    lastSeen: node.lastSeen
                });
                
                for (const neighborId of node.neighbors.keys()) {
                    if (channelNodes.has(neighborId)) {
                        const neighbor = node.neighbors.get(neighborId);
                        edges.push({
                            from: nodeId,
                            to: neighborId,
                            rssi: neighbor.rssi,
                            lastSeen: neighbor.lastSeen
                        });
                    }
                }
            }
        }
        
        return {
            nodes,
            edges,
            roomServers: Array.from(this.roomServers.keys()),
            stats: {
                totalNodes: this.nodes.size,
                totalRoomServers: this.roomServers.size,
                totalBroadcasts: this.broadcasts.size
            }
        };
    }
    
    // Clean up old broadcasts
    cleanup() {
        const now = Date.now();
        for (const [packetId, broadcast] of this.broadcasts) {
            if (now - broadcast.receivedAt > 600000) { // 10 min
                this.broadcasts.delete(packetId);
            }
        }
        
        for (const node of this.nodes.values()) {
            node.cleanup();
        }
    }
}

// --- MeshCore Protocol Handler ---
class MeshCoreProtocol {
    constructor() {
        this.network = new MeshNetwork();
        this.stats = {
            packetsRouted: 0,
            broadcastsProcessed: 0,
            routesCalculated: 0
        };
        
        // Periodic cleanup
        this.cleanupInterval = setInterval(() => {
            this.network.cleanup();
        }, 60000);
    }
    
    // Handle node announcement/join
    handleNodeJoin(nodeId, channelId, publicKey) {
        const node = this.network.registerNode(nodeId, NODE_TYPES.COMPANION, publicKey, channelId);
        
        // Announce to channel peers
        const channelNodes = this.network.getChannelNodes(channelId);
        const announcement = {
            nodeId,
            type: NODE_TYPES.COMPANION,
            publicKey,
            action: 'join',
            channelId
        };
        
        return {
            node,
            announcement,
            peers: Array.from(channelNodes)
        };
    }
    
    // Handle neighbor discovery
    handleNeighborDiscovery(nodeId, channelId, neighbors = []) {
        const node = this.network.getOrCreateNode(nodeId, NODE_TYPES.COMPANION, null, channelId);
        
        for (const { neighborId, rssi, type } of neighbors) {
            node.updateNeighbor(neighborId, rssi, type);
        }
        
        return {
            node: node.nodeId,
            neighbors: Array.from(node.neighbors.entries()).map(([id, info]) => ({
                nodeId: id,
                rssi: info.rssi,
                type: info.type,
                lastSeen: info.lastSeen
            }))
        };
    }
    
    // Handle a mesh message
    handleMessage(packet, channelId, senderId) {
        const packetObj = packet instanceof MeshPacket 
            ? packet 
            : MeshPacket.deserialize(packet);
        
        if (!packetObj.from) {
            packetObj.from = senderId;
        }
        
        if (packetObj.type === PACKET_TYPES.BROADCAST) {
            // Flood broadcast
            const targets = this.network.broadcast(packetObj, channelId, senderId);
            this.stats.broadcastsProcessed++;
            
            return {
                type: 'broadcast',
                targets,
                packetId: packetObj.id,
                hopLimit: packetObj.hopLimit
            };
        }
        
        if (packetObj.type === PACKET_TYPES.DATA) {
            // Direct routing
            const route = this.network.route(packetObj, channelId, senderId);
            this.stats.packetsRouted++;
            
            return {
                type: 'direct',
                result: route,
                packetId: packetObj.id
            };
        }
        
        // Routing protocol message
        this.stats.packetsRouted++;
        return {
            type: 'protocol',
            packet: packetObj.serialize()
        };
    }
    
    // Get network stats
    getStats() {
        const topology = this.network.getTopology();
        return {
            ...this.stats,
            ...topology.stats,
            nodes: topology.nodes.length,
            edges: topology.edges.length
        };
    }
    
    // Get topology
    getTopology(channelId) {
        return this.network.getTopology(channelId);
    }
    
    // Get routing table for a node
    getRoutingTable(nodeId) {
        const node = this.network.nodes.get(nodeId);
        if (!node) return null;
        
        return {
            nodeId,
            routes: Array.from(node.routes.entries()).map(([dest, route]) => ({
                destination: dest,
                path: route.path,
                createdAt: route.createdAt,
                expiresAt: route.expiresAt
            })),
            neighbors: Array.from(node.neighbors.entries()).map(([id, info]) => ({
                nodeId: id,
                rssi: info.rssi,
                type: info.type
            })),
            storedMessages: node.messageStore.length
        };
    }
}

// Create singleton instance
const meshProtocol = new MeshCoreProtocol();

module.exports = {
    MeshPacket,
    MeshNode,
    MeshNetwork,
    MeshCoreProtocol,
    meshProtocol,
    NODE_TYPES,
    PACKET_TYPES
};
