(function(window) {
    'use strict';

    const { NEOCrypto, generateOnionAddress, simulateMeshDiscovery } = window;

    // NEOCHAT Client Class
    class NEOCHATClient {
        constructor() {
            this.socket = null;
            this.nickname = '';
            this.channelId = '';
            this.isConnected = false;
            this.isEncrypted = false;
            this.crypto = new NEOCrypto();
            this.publicKey = null;
            this.meshDevices = [];
            // Configurable server URL for itch.io deployment
            this.serverUrl = window.CHAT_SERVER_URL || window.location.origin;
            this.init();
        }

        // Initialize the client
        async init() {
            console.log('[NEOCHAT] Initializing client...');
            
            // Create crypto key pair
            this.publicKey = await this.crypto.generateKeyPair();
            
            // Load saved preferences
            this.loadPreferences();
            
            // Setup UI event handlers
            this.setupUIHandlers();
            
            // Attempt initial connection
            this.attemptConnection();
        }

        // Load user preferences from localStorage
        loadPreferences() {
            const savedNick = localStorage.getItem('neochat_nickname');
            const savedChannel = localStorage.getItem('neochat_channel');
            const savedEncrypted = localStorage.getItem('neochat_encrypted');
            
            if (savedNick) this.nickname = savedNick;
            if (savedChannel) this.channelId = savedChannel;
            if (savedEncrypted) this.isEncrypted = savedEncrypted === 'true';
            
            return { nickname: this.nickname, channel: this.channelId, encrypted: this.isEncrypted };
        }

        // Save preferences to localStorage
        savePreferences() {
            localStorage.setItem('neochat_nickname', this.nickname);
            localStorage.setItem('neochat_channel', this.channelId);
            localStorage.setItem('neochat_encrypted', this.isEncrypted.toString());
        }

        // Setup UI event handlers
        setupUIHandlers() {
            const connectionScreen = document.getElementById('connection-screen');
            const chatScreen = document.getElementById('chat-screen');
            
            // Connection form
            const connectBtn = document.getElementById('connect-btn');
            const nicknameInput = document.getElementById('nickname');
            const channelInput = document.getElementById('channel');
            const encryptionToggle = document.getElementById('encryption-toggle');
            const createChannelBtn = document.getElementById('create-channel');
            
            // Send message
            const sendBtn = document.getElementById('send-btn');
            const messageInput = document.getElementById('message-input');
            
            // Modal controls
            const ircModal = document.getElementById('irc-modal');
            const ircClose = document.getElementById('irc-close');
            const torModal = document.getElementById('tor-modal');
            const torClose = document.getElementById('tor-close');
            const meshModal = document.getElementById('mesh-modal');
            const meshClose = document.getElementById('mesh-close');
            
            // Connection button click
            connectBtn.addEventListener('click', () => this.connect());
            
            // Enter key for nickname and channel
            nicknameInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') this.connect();
            });
            
            channelInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.createChannel();
                }
            });
            
            // Channel creation
            createChannelBtn.addEventListener('click', () => this.createChannel());
            
            // Message sending
            sendBtn.addEventListener('click', () => this.sendMessage());
            messageInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.sendMessage();
                }
            });
            
            // Modal controls
            if (ircClose) ircClose.addEventListener('click', () => this.closeModal('irc'));
            if (torClose) torClose.addEventListener('click', () => this.closeModal('tor'));
            if (meshClose) meshClose.addEventListener('click', () => this.closeModal('mesh'));
            
            // Network features
            const ircBridgeBtn = document.getElementById('irc-bridge');
            const torServiceBtn = document.getElementById('tor-service');
            const meshNetworkBtn = document.getElementById('mesh-network');
            
            if (ircBridgeBtn) ircBridgeBtn.addEventListener('click', () => this.openIRCModal());
            if (torServiceBtn) torServiceBtn.addEventListener('click', () => this.openTorModal());
            if (meshNetworkBtn) meshNetworkBtn.addEventListener('click', () => this.openMeshModal());
            
            // WiFi Scanner & GPS Map handlers
            const wifiScannerBtn = document.getElementById('wifi-scanner');
            const gpsMapBtn = document.getElementById('gps-map');
            const wifiClose = document.getElementById('wifi-close');
            const gpsClose = document.getElementById('gps-close');
            const wifiScanBtn = document.getElementById('wifi-scan-btn');
            
            if (wifiScannerBtn) wifiScannerBtn.addEventListener('click', () => this.openWiFiModal());
            if (gpsMapBtn) gpsMapBtn.addEventListener('click', () => this.openGPSModal());
            if (wifiClose) wifiClose.addEventListener('click', () => this.closeModal('wifi'));
            if (gpsClose) gpsClose.addEventListener('click', () => this.closeModal('gps'));
            if (wifiScanBtn) wifiScanBtn.addEventListener('click', () => this.scanWiFi());
        }

        // Attempt connection to server
        attemptConnection() {
            const savedPrefs = this.loadPreferences();
            
            if (savedPrefs.nickname && savedPrefs.channel) {
                // Try to reconnect with saved preferences
                this.nickname = savedPrefs.nickname;
                this.channelId = savedPrefs.channel;
                this.isEncrypted = savedPrefs.encrypted;
                
                // Update UI
                document.getElementById('nickname').value = this.nickname;
                document.getElementById('channel').value = this.channelId;
                document.getElementById('encryption-toggle').checked = this.isEncrypted;
                
                this.connect();
            }
        }

        // Connect to server
        async connect() {
            this.nickname = document.getElementById('nickname').value || this.crypto.generateNickname();
            this.channelId = document.getElementById('channel').value || this.generateChannelId();
            this.isEncrypted = document.getElementById('encryption-toggle').checked;
            
            if (!this.nickname || !this.channelId) {
                this.showError('Please enter a nickname and channel ID');
                return;
            }
            
            // Show loading state
            const connectBtn = document.getElementById('connect-btn');
            connectBtn.textContent = 'CONNECTING...';
            connectBtn.disabled = true;
            
            try {
                // Initialize Socket.IO connection
                this.socket = io(this.serverUrl, {
                    transports: ['websocket', 'polling'],
                    query: {
                        nickname: this.nickname,
                        channel: this.channelId,
                        encrypted: this.isEncrypted.toString(),
                        publicKey: this.publicKey ? await this.exportPublicKey(this.publicKey) : null
                    }
                });

                this.setupSocketEvents();
                
                console.log(`[NEOCHAT] Connecting to channel: ${this.channelId}`);
                
                // Save preferences
                this.savePreferences();
                
                // Show chat screen
                this.switchScreen('chat');
                
                // Show welcome message
                this.addSystemMessage(`[CONECTED] Joined ${this.channelId} as ${this.nickname}`);
                
            } catch (error) {
                console.error('[NEOCHAT] Connection failed:', error);
                this.showError(`Connection failed: ${error.message}`);
                connectBtn.textContent = 'CONNECT';
                connectBtn.disabled = false;
            }
        }

        // Setup socket event handlers
        setupSocketEvents() {
            if (!this.socket) return;

            this.socket.on('connect', () => {
                console.log('[NEOCHAT] Connected to server');
                this.isConnected = true;
                this.updateStatus('online', 'Connected');
            });

            this.socket.on('disconnect', (reason) => {
                console.log('[NEOCHAT] Disconnected:', reason);
                this.isConnected = false;
                this.updateStatus('offline', 'Disconnected');
            });

            this.socket.on('connect_error', (error) => {
                console.error('[NEOCHAT] Connection error:', error);
                this.showError(`Connection error: ${error.message}`);
            });

            // Channel join response
            this.socket.on('channel-info', (data) => {
                this.addSystemMessage(`[JOIN] Welcome to ${data.channelId}`);
                
                // Update user list
                this.updateUserList(data.members);
                
                // Show channel encryption status
                if (data.encrypted) {
                    this.updateEncryptionIndicator(true);
                    this.addSystemMessage('[ENCRYPTION] Channel requires encrypted messages');
                }
            });

            // New user joined
            this.socket.on('user-joined', (data) => {
                this.addSystemMessage(`[ENTER] ${data.nickname} has joined`);
                this.updateUserList(this.getUserList());
            });

            // User left
            this.socket.on('user-left', (data) => { // WARNING: The server does not send 'user-left'
                this.addSystemMessage(`[LEAVE] ${data.nickname} has left`);
                this.updateUserList(this.getUserList());
            });

            // Incoming message
            this.socket.on('message', (data) => {
                console.log('[NEOCHAT] Message received:', data);
                this.displayMessage(data);
            });

            // Error
            this.socket.on('error', (error) => {
                this.showError(error);
            });

            // IRC status
            this.socket.on('irc-status', (data) => {
                console.log('[NEOCHAT] IRC status:', data);
                this.addSystemMessage(`[IRC] ${data.status}: ${data.message}`);
            });

            // IRC user joined
            this.socket.on('irc-user-joined', (data) => {
                this.addSystemMessage(`[IRC] ${data.nickname} from ${data.server} joined IRC channel ${data.channel}`);
            });

            // Mesh node announcement
            this.socket.on('mesh-node', (data) => {
                console.log('[NEOCHAT] Mesh node:', data);
                if (!this.meshDevices.includes(data.nodeId)) {
                    this.meshDevices.push(data.nodeId);
                    this.updateMeshStatus();
                }
            });

            // Tor key generated
            this.socket.on('tor-key-generated', (data) => {
                console.log('[NEOCHAT] Tor key:', data.address);
                this.addSystemMessage(`[TOR] Hidden service address: ${data.address}`);
                this.updateTorStatus(data.address);
            });
        }

        // Create new channel
        createChannel() {
            const channelId = this.generateChannelId();
            document.getElementById('channel').value = channelId;
            this.connect();
        }

        // Generate unique channel ID
        generateChannelId() {
            const chars = '0123456789abcdef';
            let id = '';
            for (let i = 0; i < 32; i++) {
                id += chars[Math.floor(Math.random() * chars.length)];
            }
            return id;
        }

        // Send message
        async sendMessage() {
            if (!this.socket || !this.isConnected) {
                this.showError('Not connected to server');
                return;
            }

            const messageInput = document.getElementById('message-input');
            const content = messageInput.value.trim();
            
            if (!content) return;

            messageInput.value = '';

            let messageData = {
                type: this.isEncrypted ? 'encrypted' : 'plaintext',
                content: content
            };

            if (this.isEncrypted && this.publicKey) {
                try {
                    // Encrypt the message
                    const encrypted = await this.crypto.encryptMessage(content, this.publicKey);
                    messageData = {
                        type: 'encrypted',
                        content: encrypted.content,
                        nonce: encrypted.nonce
                    };
                } catch (error) {
                    console.error('[NEOCHAT] Encryption failed:', error);
                    this.showError('Failed to encrypt message');
                    return;
                }
            }

            this.socket.emit('message', messageData);
        }

        // Display received message
        displayMessage(data) {
            const messagesContainer = document.getElementById('messages');
            const messageDiv = document.createElement('div');
            messageDiv.className = 'message';
            
            const senderClass = data.from === this.nickname ? 'own' : 'other';
            
            // Format message with escaping
            const escapedContent = this.escapeHtml(data.content);
            
            messageDiv.innerHTML = `
                <div class="message-header">
                    <span class="sender ${senderClass}">${this.escapeHtml(data.from)}</span>
                    <span class="time">${new Date().toLocaleTimeString()}</span>
                </div>
                <div class="message-content">
                    <pre>${data.type === 'encrypted' ? this.escapeHtml('[ENCRYPTED] ') + escapedContent : escapedContent}</pre>
                </div>
            `;
            
            messagesContainer.appendChild(messageDiv);
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }

        // Add system message
        addSystemMessage(text) {
            const messagesContainer = document.getElementById('messages');
            const messageDiv = document.createElement('div');
            messageDiv.className = 'message system';
            
            messageDiv.innerHTML = `
                <div class="message-content">
                    <pre>> ${this.escapeHtml(text)}</pre>
                </div>
            `;
            
            messagesContainer.appendChild(messageDiv);
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }

        // Update user list
        updateUserList() {
            const userList = document.getElementById('user-list');
            userList.innerHTML = '';
            
            // This would be called from socket events to update the list
        }

        // Get current user list
        getUserList() {
            return []; // Implement based on server data
        }

        // Update encryption indicator
        updateEncryptionIndicator(enabled) {
            const indicator = document.getElementById('encryption-indicator');
            if (indicator) {
                if (enabled) {
                    indicator.innerHTML = '<span class="dot green"></span> CRIPTO';
                } else {
                    indicator.innerHTML = '<span class="dot red"></span> DESCRIPTO';
                }
            }
        }

        // Update mesh status
        updateMeshStatus() {
            const indicator = document.getElementById('mesh-indicator');
            if (indicator && this.meshDevices.length > 0) {
                indicator.innerHTML = `<span class="dot yellow"></span> MESH (${this.meshDevices.length})`;
            }
        }

        // Update Tor status
        updateTorStatus(address) {
            const indicator = document.getElementById('tor-indicator');
            if (indicator) {
                indicator.innerHTML = `<span class="dot green"></span> TOR: ${address}`;
            }
        }

        // Update latency display
        updateLatency(latency) {
            const latencySpan = document.getElementById('latency');
            if (latencySpan) {
                latencySpan.textContent = `${latency}ms`;
            }
        }

        // Update status display
        updateStatus(status, text) {
            const statusDot = document.queryOfSelector('.status-dot');
            const statusText = document.querySelector('.status-text');
            
            if (statusDot && statusText) {
                statusDot.className = `status-dot ${status}`;
                statusText.textContent = text;
            }
        }

        // Open IRC modal
        openIRCModal() {
            const modal = document.getElementById('irc-modal');
            modal.classList.remove('hidden');
        }

        // Open Tor modal
        openTorModal() {
            const modal = document.getElementById('tor-modal');
            modal.classList.remove('hidden');
            this.generateTorKey();
        }

        // Open mesh modal
        openMeshModal() {
            const modal = document.getElementById('mesh-modal');
            modal.classList.remove('hidden');
            this.meshDevices = simulateMeshDiscovery();
            this.updateMeshStatus();
        }

        // Open WiFi scanner modal
        openWiFiModal() {
            const modal = document.getElementById('wifi-modal');
            modal.classList.remove('hidden');
            this.addSystemMessage('[WIFI] Scanner aberto - clica em ESCANEAR_REDES');
        }

        // Open GPS map modal
        openGPSModal() {
            const modal = document.getElementById('gps-modal');
            modal.classList.remove('hidden');
            this.loadGPSMap();
        }

        // Scan for WiFi networks
        async scanWiFi() {
            const statusEl = document.getElementById('wifi-status');
            const resultsEl = document.getElementById('wifi-scan-results');
            
            if (statusEl) statusEl.textContent = '> Escaneando redes WiFi...';
            
            try {
                const response = await fetch(`${this.serverUrl}/api/wifi/all`);
                const data = await response.json();
                
                if (data.networks && data.networks.length > 0) {
                    let html = '';
                    data.networks.forEach(network => {
                        const pwd = network.password ? `<br><span style="color:#00ff44">PASSWORD: ${network.password}</span>` : '<br><span style="color:#ff4444">ABERTA</span>';
                        html += `<div class="user-item">
                            <div class="user-name">${network.name} (${network.ssid})</div>
                            <div class="user-status">${network.city} | ${network.encryption} ${pwd}</div>
                        </div>`;
                    });
                    resultsEl.innerHTML = html;
                    if (statusEl) statusEl.textContent = `> Encontradas ${data.count} redes WiFi públicas`;
                    this.addSystemMessage(`[WIFI] Encontradas ${data.count} redes WiFi`);
                } else {
                    if (statusEl) statusEl.textContent = '> Nenhuma rede encontrada';
                }
            } catch (error) {
                if (statusEl) statusEl.textContent = '> Erro ao escanear: ' + error.message;
                this.addSystemMessage('[ERRO] Escaneamento WiFi falhou');
            }
        }

        // Load GPS map with WiFi networks
        async loadGPSMap() {
            try {
                const [mapResponse, locationResponse] = await Promise.all([
                    fetch(`${this.serverUrl}/api/map/portugal`),
                    fetch(`${this.serverUrl}/api/gps/location`)
                ]);
                
                const mapData = await mapResponse.json();
                const locationData = await locationResponse.json();
                
                const locationEl = document.getElementById('gps-location');
                if (locationEl && locationData.location) {
                    locationEl.textContent = `> LAT: ${locationData.location.lat} | LNG: ${locationData.location.lng}`;
                }
                
                const mapEl = document.getElementById('wifi-map');
                if (mapEl && mapData.metadata) {
                    // Render WiFi network markers on map
                    let html = '<div style="position: absolute; top: 10px; left: 10px; color: #00ff44; font-size: 12px;">📍 Portugal Continental</div>';
                    
                    // Fetch all WiFi networks
                    const wifiResponse = await fetch(`${this.serverUrl}/api/wifi/all`);
                    const wifiData = await wifiResponse.json();
                    
                    if (wifiData.networks) {
                        wifiData.networks.forEach(network => {
                            // Scale coordinates to map bounds
                            const bounds = mapData.bounds;
                            const x = ((network.lng - bounds.west) / (bounds.east - bounds.west)) * 100;
                            const y = ((bounds.north - network.lat) / (bounds.north - bounds.south)) * 100;
                            
                            const color = network.encryption === 'none' ? '#ff4444' : 
                                        network.password ? '#ffaa00' : '#44ff44';
                            
                            html += `<div style="position: absolute; left: ${x}%; top: ${y}%; width: 8px; height: 8px; border-radius: 50%; background: ${color}; title="${network.name} - ${network.city}"></div>`;
                        });
                    }
                    
                    mapEl.innerHTML = html;
                }
                
                this.addSystemMessage('[GPS] Mapa carregado com redes WiFi');
            } catch (error) {
                this.addSystemMessage('[ERRO] Falha ao carregar mapa GPS');
                console.error('[NEOCHAT] GPS map error:', error);
            }
        }

        // Close modal
        closeModal(modalType) {
            const modal = document.getElementById(`${modalType}-modal`);
            modal.classList.add('hidden');
        }

        // Generate Tor key (simplified)
        generateTorKey() {
            const onionAddress = generateOnionAddress();
            const onionDisplay = document.getElementById('onion-address');
            if (onionDisplay) {
                onionDisplay.textContent = `> ${onionAddress}`;
            }
        }

        // Export public key (simplified)
        async exportPublicKey(key) {
            if (typeof key === 'object' && key !== null) {
                return 'pub_' + Array.from({length: 32}, () => 
                    Math.floor(Math.random() * 16).toString(16)).join('');
            }
            return key;
        }

        // Helper: escape HTML
        escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }

        // Show error message
        showError(message) {
            this.addSystemMessage(`[ERRO] ${message}`);
            console.error('[NEOCHAT]', message);
        }

        // Switch between screens
        switchScreen(screenType) {
            const screens = document.querySelectorAll('.screen');
            screens.forEach(screen => screen.classList.remove('active'));
            
            const targetScreen = document.getElementById(`${screenType}-screen`);
            if (targetScreen) {
                targetScreen.classList.add('active');
            }
            
            // Update channel name display
            document.getElementById('channel-name').textContent = `#${this.channelId}`;
            document.getElementById('channel-type').textContent = this.isEncrypted ? 'ENCRYPTED' : 'OFFLINE';
        }

        // Create session file for deployment
        createSessionFile() {
            const sessionData = {
                server: window.location.origin,
                nickname: this.nickname,
                channel: this.channelId,
                encrypted: this.isEncrypted,
                timestamp: new Date().toISOString(),
                sessionId: Math.random().toString(36).substr(2, 9)
            };
            
            const dataStr = JSON.stringify(sessionData, null, 2);
            const blob = new Blob([dataStr], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            
            const link = document.createElement('a');
            link.href = url;
            link.download = 'neochat-session.json';
            link.click();
            
            URL.revokeObjectURL(url);
        }
    }

    // Initialize when DOM is ready
    document.addEventListener('DOMContentLoaded', () => {
        window.neochatClient = new NEOCHATClient();
        
        // Keyboard shortcuts
        document.addEventListener('keypress', (e) => {
            if (e.ctrlKey && e.key === 'k') {
                e.preventDefault();
                document.getElementById('message-input').focus();
            }
            if (e.ctrlKey && e.key === '/') {
                e.preventDefault();
                document.getElementById('nickname').focus();
            }
        });
        
        // Connection status monitoring
        setInterval(() => {
            if (window.neochatClient && window.neochatClient.socket) {
                const latency = Date.now() - (window.neochatClient.socket._lastPing || Date.now());
                window.neochatClient.updateLatency(latency);
            }
        }, 1000);
    });

    // Global function for backward compatibility
    function exportKey(key) {
        return window.neochatClient?.exportPublicKey(key);
    }
})(window);
