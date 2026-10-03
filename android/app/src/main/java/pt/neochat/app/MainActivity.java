package pt.neochat.app;

import android.Manifest;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.text.Editable;
import android.text.TextWatcher;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import java.util.List;

/**
 * Activity principal do NEOCHAT nativo.
 *
 * Duas telas: CONEXAO e CHAT, mais paineis deslizantes para WiFi e GPS.
 * Todo o visual e desenhado nativamente (sem WebView).
 */
public final class MainActivity extends android.app.Activity implements ChatClient.Listener {

    private Prefs prefs;
    private ChatClient client;
    private Crypto crypto;
    private WifiScanner wifi;
    private GpsLocator gps;

    private final Handler ui = new Handler(Looper.getMainLooper());

    // --- conexao ---
    private View connectScreen, chatScreen;
    private EditText etNick, etChannel, etServer;
    private TextView tvStatus;
    private Button btnConnect;
    private String activeChannel = "neochat";

    // --- chat ---
    private LinearLayout msgList;
    private EditText etMsg;
    private TextView tvChannel, tvLatency, tvMembers, tvUsers, tvCrypto;
    private LinearLayout wifiPanel, gpsPanel;
    private TextView tvWifiList, tvGpsInfo;

    @Override
    protected void onCreate(Bundle saved) {
        super.onCreate(saved);
        prefs = new Prefs(this);
        crypto = new Crypto();
        wifi = new WifiScanner(this);
        gps = new GpsLocator(this);
        client = new ChatClient(this);

        buildUi();
    }

    // ============================================================ UI

    private int dp(int v) {
        return (int) (v * getResources().getDisplayMetrics().density);
    }

    private TextView label(String text, int size, int color) {
        TextView t = new TextView(this);
        t.setText(text);
        t.setTextSize(size);
        t.setTextColor(color);
        t.setFontFeatureSettings("monospace");
        t.setTypeface(android.graphics.Typeface.MONOSPACE);
        return t;
    }

    private Button neonButton(String text, boolean danger) {
        Button b = new Button(this);
        b.setText(text);
        b.setTextSize(11);
        b.setTextColor(Color.parseColor("#00ff44"));
        b.setBackgroundColor(Color.parseColor("#001a0d"));
        b.setAllCaps(false);
        b.setTypeface(android.graphics.Typeface.MONOSPACE, android.graphics.Typeface.BOLD);
        b.setPadding(dp(10), dp(6), dp(10), dp(6));
        if (danger) {
            b.setTextColor(Color.parseColor("#ff4444"));
            b.setBackgroundColor(Color.parseColor("#1a0000"));
        }
        return b;
    }

    private EditText termInput(String hint) {
        EditText e = new EditText(this);
        e.setHint(hint);
        e.setHintTextColor(Color.parseColor("#00aa33"));
        e.setTextColor(Color.parseColor("#00ff44"));
        e.setTextSize(13);
        e.setTypeface(android.graphics.Typeface.MONOSPACE);
        e.setBackgroundColor(Color.parseColor("#000a04"));
        e.setSingleLine(true);
        return e;
    }

    private LinearLayout col(int padding) {
        LinearLayout l = new LinearLayout(this);
        l.setOrientation(LinearLayout.VERTICAL);
        l.setPadding(dp(padding), dp(padding), dp(padding), dp(padding));
        return l;
    }

    private void buildUi() {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(Color.parseColor("#05080a"));

        buildConnectScreen();
        buildChatScreen();

        root.addView(connectScreen);
        root.addView(chatScreen, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        setContentView(root);
    }

    private void buildConnectScreen() {
        LinearLayout wrap = new LinearLayout(this);
        wrap.setOrientation(LinearLayout.VERTICAL);
        wrap.setGravity(Gravity.CENTER);
        wrap.setBackgroundColor(Color.parseColor("#05080a"));
        connectScreen = wrap;

        LinearLayout box = col(24);
        box.setBackgroundColor(Color.parseColor("#00110a"));

        TextView title = label("NEOCHAT", 30, Color.parseColor("#00ff44"));
        title.setGravity(Gravity.CENTER);
        box.addView(title);

        TextView sub = label("> PLATAFORMA DE CHAT ANONIMO CYBERPUNK", 10, Color.parseColor("#00aa44"));
        sub.setGravity(Gravity.CENTER);
        box.addView(sub, lp(0, 8, 0, 8));

        etNick = termInput("NICKNAME > ");
        etNick.setText(prefs.nickname());
        box.addView(etNick, lp(0, 6, 0, 2));

        etChannel = termInput("CHANNEL_ID > #neochat");
        etChannel.setText(prefs.channel());
        box.addView(etChannel, lp(0, 2, 0, 6));

        etServer = termInput("SERVIDOR > ");
        etServer.setText(prefs.server());
        box.addView(etServer, lp(0, 2, 0, 12));

        btnConnect = neonButton("CONECTAR", false);
        btnConnect.setOnClickListener(v -> doConnect());
        box.addView(btnConnect, lp(0, 0, 0, 10));

        tvStatus = label("> DESCONECTADO", 11, Color.parseColor("#ff4444"));
        tvStatus.setGravity(Gravity.CENTER);
        box.addView(tvStatus);

        wrap.addView(box);
    }

    private LinearLayout.LayoutParams lp(int w, int top, int h, int bottom) {
        LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(
                w < 0 ? w : ViewGroup.LayoutParams.MATCH_PARENT,
                h < 0 ? h : ViewGroup.LayoutParams.WRAP_CONTENT);
        p.topMargin = dp(top);
        p.bottomMargin = dp(bottom);
        return p;
    }

    private void buildChatScreen() {
        LinearLayout main = new LinearLayout(this);
        main.setOrientation(LinearLayout.VERTICAL);
        main.setVisibility(View.GONE);
        chatScreen = main;

        // cabecalho
        LinearLayout header = new LinearLayout(this);
        header.setOrientation(LinearLayout.HORIZONTAL);
        header.setGravity(Gravity.CENTER_VERTICAL);
        header.setBackgroundColor(Color.parseColor("#00110a"));
        header.setPadding(dp(10), dp(6), dp(10), dp(6));

        tvChannel = label("NEOCHAT", 14, Color.parseColor("#00ff44"));
        tvChannel.setTypeface(android.graphics.Typeface.MONOSPACE, android.graphics.Typeface.BOLD);
        header.addView(tvChannel, new LinearLayout.LayoutParams(0,
                ViewGroup.LayoutParams.WRAP_CONTENT, 1f));

        tvLatency = label("0ms", 10, Color.parseColor("#00aa44"));
        header.addView(tvLatency);

        Button bMenu = neonButton("≡", false);
        bMenu.setOnClickListener(v -> togglePanel(wifiPanel));
        header.addView(bMenu);
        Button bGps = neonButton("GPS", false);
        bGps.setOnClickListener(v -> togglePanel(gpsPanel));
        header.addView(bGps);
        Button bExit = neonButton("X", true);
        bExit.setOnClickListener(v -> doDisconnect());
        header.addView(bExit);

        main.addView(header);

        // corpo: mensagens + painel
        LinearLayout body = new LinearLayout(this);
        body.setOrientation(LinearLayout.HORIZONTAL);

        ScrollView scroll = new ScrollView(this);
        msgList = new LinearLayout(this);
        msgList.setOrientation(LinearLayout.VERTICAL);
        msgList.setPadding(dp(10), dp(8), dp(10), dp(8));
        scroll.addView(msgList);
        body.addView(scroll, new LinearLayout.LayoutParams(0,
                ViewGroup.LayoutParams.MATCH_PARENT, 1f));

        // painel lateral (utilizadores + rede)
        LinearLayout side = new LinearLayout(this);
        side.setOrientation(LinearLayout.VERTICAL);
        side.setBackgroundColor(Color.parseColor("#00110a"));
        side.setPadding(dp(8), dp(8), dp(8), dp(8));
        side.setLayoutParams(new LinearLayout.LayoutParams(dp(120),
                ViewGroup.LayoutParams.MATCH_PARENT));

        TextView lblUsers = label("USUARIOS_ONLINE", 9, Color.parseColor("#00aa44"));
        side.addView(lblUsers);
        tvUsers = label("(vazio)", 9, Color.parseColor("#00ff44"));
        side.addView(tvUsers);
        tvMembers = label("", 9, Color.parseColor("#00aa44"));
        side.addView(tvMembers);

        // botoes de funcionalidade
        Button bWifi = neonButton("ESCANEADOR_WIFI", false);
        bWifi.setOnClickListener(v -> runWifiScan());
        side.addView(bWifi, lp(-1, 10, 0, 2));

        Button bMesh = neonButton("MALLA_OFFGRID", false);
        bMesh.setOnClickListener(v -> {
            client.meshJoin("neon-" + (prefs.nickname().isEmpty() ? "node" : prefs.nickname()));
            addSys("> MALLA_OFFGRID: a entrar na malha...");
        });
        side.addView(bMesh, lp(-1, 0, 0, 2));

        Button bIrc = neonButton("PUENTE_IRC", false);
        bIrc.setOnClickListener(v -> {
            client.ircConnect("irc.hack.chat", 6697,
                    prefs.nickname().isEmpty() ? "neon" : prefs.nickname(), "#lobby", "babayaga");
            addSys("> PUENTE_IRC: a ligar a irc.hack.chat...");
        });
        side.addView(bIrc, lp(-1, 0, 0, 2));

        body.addView(side);
        main.addView(body, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));

        // painel WiFi
        wifiPanel = col(10);
        wifiPanel.setBackgroundColor(Color.parseColor("#001a0a"));
        tvWifiList = label("> ESCANEADOR_WIFI pronto", 10, Color.parseColor("#00ff44"));
        wifiPanel.addView(tvWifiList);
        Button bScan = neonButton("ESCANEAR_REDES", false);
        bScan.setOnClickListener(v -> runWifiScan());
        wifiPanel.addView(bScan, lp(-1, 8, 0, 2));
        Button bClose = neonButton("FECHAR", true);
        bClose.setOnClickListener(v -> togglePanel(wifiPanel));
        wifiPanel.addView(bClose);
        wifiPanel.setVisibility(View.GONE);
        main.addView(wifiPanel);

        // painel GPS
        gpsPanel = col(10);
        gpsPanel.setBackgroundColor(Color.parseColor("#001a0a"));
        tvGpsInfo = label("> MAPA_GPS: a aguardar", 10, Color.parseColor("#00ff44"));
        gpsPanel.addView(tvGpsInfo);
        gpsPanel.addView(new GpsMapView(this));
        Button bLoc = neonButton("LOCALIZAR", false);
        bLoc.setOnClickListener(v -> doLocate());
        gpsPanel.addView(bLoc, lp(-1, 6, 0, 2));
        Button bClose2 = neonButton("FECHAR", true);
        bClose2.setOnClickListener(v -> togglePanel(gpsPanel));
        gpsPanel.addView(bClose2);
        gpsPanel.setVisibility(View.GONE);
        main.addView(gpsPanel);

        // entrada
        LinearLayout inputBar = new LinearLayout(this);
        inputBar.setOrientation(LinearLayout.HORIZONTAL);
        inputBar.setPadding(dp(8), dp(6), dp(8), dp(8));
        inputBar.setBackgroundColor(Color.parseColor("#00110a"));

        etMsg = termInput("DIGITE MENSAGEM > ");
        inputBar.addView(etMsg, new LinearLayout.LayoutParams(0,
                ViewGroup.LayoutParams.WRAP_CONTENT, 1f));

        Button bSend = neonButton("ENVIAR", false);
        bSend.setOnClickListener(v -> doSend());
        inputBar.addView(bSend);

        etMsg.addTextChangedListener(new TextWatcher() {
            @Override public void beforeTextChanged(CharSequence s, int a, int b, int c) { }
            @Override public void onTextChanged(CharSequence s, int a, int b, int c) { }
            @Override public void afterTextChanged(Editable s) { }
        });
        etMsg.setOnEditorActionListener((v, id, ev) -> { doSend(); return true; });

        main.addView(inputBar);

        tvCrypto = label("> CRIPTO: AES-256-GCM", 9, Color.parseColor("#00aa44"));
        main.addView(tvCrypto);
    }

    private void togglePanel(View panel) {
        if (panel.getVisibility() == View.VISIBLE) {
            panel.setVisibility(View.GONE);
        } else {
            // esconde o outro painel
            if (panel != wifiPanel) wifiPanel.setVisibility(View.GONE);
            if (panel != gpsPanel) gpsPanel.setVisibility(View.GONE);
            panel.setVisibility(View.VISIBLE);
        }
    }

    // ============================================================ accoes

    private void doConnect() {
        final String nick = etNick.getText().toString().trim();
        final String chan = etChannel.getText().toString().trim().replace("#", "");
        final String server = etServer.getText().toString().trim();

        if (server.isEmpty()) {
            toast("Servidor vazio");
            return;
        }
        if (nick.isEmpty()) {
            toast("Escreve um nickname");
            return;
        }

        prefs.setNickname(nick);
        prefs.setChannel(chan.isEmpty() ? "neochat" : chan);
        prefs.setServer(server);
        activeChannel = prefs.channel();

        btnConnect.setEnabled(false);
        tvStatus.setText("> A LIGAR...");
        tvStatus.setTextColor(Color.parseColor("#ffaa00"));

        try {
            client.connect(server, activeChannel, nick,
                    crypto.publicKeyFingerprint(), prefs.encrypted());
        } catch (Exception e) {
            tvStatus.setText("> ERRO: " + e.getMessage());
            tvStatus.setTextColor(Color.parseColor("#ff4444"));
            btnConnect.setEnabled(true);
        }
    }

    private void doDisconnect() {
        client.disconnect();
        chatScreen.setVisibility(View.GONE);
        connectScreen.setVisibility(View.VISIBLE);
        btnConnect.setEnabled(true);
        tvStatus.setText("> DESCONECTADO");
        tvStatus.setTextColor(Color.parseColor("#ff4444"));
    }

    private void doSend() {
        String text = etMsg.getText().toString().trim();
        if (text.isEmpty() || !client.isConnected()) {
            return;
        }
        String payload;
        String type;
        String sig = null;

        if (prefs.encrypted()) {
            payload = crypto.encrypt(text);
            sig = crypto.sign(text);
            type = "encrypted";
        } else {
            payload = text;
            type = "plain";
        }

        client.send(activeChannel, payload, "", sig, type);
        addMsg(prefs.nickname(), text, true, prefs.encrypted());
        etMsg.setText("");
    }

    private void runWifiScan() {
        tvWifiList.setText("> A ESCANEAR...");
        new Thread(() -> {
            List<WifiScanner.Result> results = wifi.scan();
            StringBuilder sb = new StringBuilder();
            sb.append("> ").append(results.size()).append(" rede(s):\n");
            for (WifiScanner.Result r : results) {
                sb.append("\n> ").append(r.ssid == null ? "(oculta)" : r.ssid)
                        .append("  ").append(r.level).append("dBm")
                        .append("  ").append(r.security)
                        .append("  ").append(r.frequency).append("MHz")
                        .append("  ").append("#".repeat(Math.max(0, r.bars())));
            }
            final String out = sb.toString();
            ui.post(() -> {
                tvWifiList.setText(out);
                if (!wifiPanel.getParent().getParent().getClass().getSimpleName().isEmpty()) {
                    wifiPanel.setVisibility(View.VISIBLE);
                }
            });
        }).start();
    }

    private void doLocate() {
        if (!gps.hasPermission()) {
            requestPermissions(new String[]{
                    Manifest.permission.ACCESS_FINE_LOCATION,
                    Manifest.permission.ACCESS_COARSE_LOCATION}, 1);
            return;
        }
        tvGpsInfo.setText("> A OBTER POSICAO...");
        GpsMapView map = findMapView(gpsPanel);
        gps.requestSingle(new GpsLocator.Callback() {
            @Override public void onLocation(double lat, double lng, float acc, String provider) {
                if (map != null) map.setPosition(lat, lng);
                StringBuilder sb = new StringBuilder();
                sb.append(String.format("> LAT: %.6f  LNG: %.6f%n", lat, lng));
                sb.append(String.format("> PRECISAO: %.0f m  (%s)%n", acc, provider));
                List<GpsLocator.City> near = gps.nearbyCities(lat, lng);
                sb.append("\n> CIDADES PERTO:");
                int n = 0;
                for (GpsLocator.City c : near) {
                    if (c.distanceKm < 0) continue;
                    if (n++ >= 5) break;
                    sb.append(String.format("%n> %s — %.1f km", c.name, c.distanceKm));
                }
                final String out = sb.toString();
                ui.post(() -> {
                    tvGpsInfo.setText(out);
                    gpsPanel.setVisibility(View.VISIBLE);
                });
            }
            @Override public void onDenied() {
                ui.post(() -> tvGpsInfo.setText("> SEM PERMISSAO DE LOCALIZACAO"));
            }
        });
    }

    private GpsMapView findMapView(View parent) {
        if (parent instanceof GpsMapView) return (GpsMapView) parent;
        if (parent instanceof ViewGroup) {
            ViewGroup vg = (ViewGroup) parent;
            for (int i = 0; i < vg.getChildCount(); i++) {
                GpsMapView r = findMapView(vg.getChildAt(i));
                if (r != null) return r;
            }
        }
        return null;
    }

    private void addMsg(String from, String text, boolean mine, boolean encrypted) {
        TextView t = label((mine ? "> " : "< ") + from + ": " + text,
                12, encrypted ? Color.parseColor("#00ff44") : Color.parseColor("#ffcc00"));
        t.setPadding(0, dp(3), 0, dp(3));
        msgList.addView(t);
        scrollToBottom();
    }

    private void addSys(String text) {
        TextView t = label(text, 10, Color.parseColor("#00aa44"));
        t.setPadding(0, dp(2), 0, dp(2));
        msgList.addView(t);
        scrollToBottom();
    }

    private void scrollToBottom() {
        msgList.post(() -> {
            ScrollView p = (ScrollView) msgList.getParent();
            p.fullScroll(View.FOCUS_DOWN);
        });
    }

    private void toast(String s) {
        Toast.makeText(this, s, Toast.LENGTH_SHORT).show();
    }

    @Override public void onRequestPermissionsResult(int code, String[] perms, int[] res) {
        super.onRequestPermissionsResult(code, perms, res);
        if (code == 1) {
            for (int r : res) {
                if (r == PackageManager.PERMISSION_GRANTED) {
                    doLocate();
                    return;
                }
            }
            toast("Localizacao negada");
        }
    }

    // ============================================================ ChatClient.Listener

    @Override public void onConnected() {
        chatScreen.setVisibility(View.VISIBLE);
        connectScreen.setVisibility(View.GONE);
        tvChannel.setText("NEOCHAT :: " + activeChannel);
        tvStatus.setText("> LIGADO");
        addSys("> Conexao encriptada: AES-256-GCM");
        addSys("> Canal: #" + activeChannel);
    }

    @Override public void onDisconnected() {
        addSys("> DESCONECTADO do servidor");
        tvLatency.setText("—");
    }

    @Override public void onConnectError(String message) {
        tvStatus.setText("> ERRO: " + message);
        tvStatus.setTextColor(Color.parseColor("#ff4444"));
        btnConnect.setEnabled(true);
    }

    @Override public void onChannelInfo(String channelId, int members, boolean encrypted) {
        tvChannel.setText("NEOCHAT :: " + channelId);
        tvMembers.setText(members + " membro(s)");
        tvCrypto.setText("> CRIPTO: " + (encrypted ? "AES-256-GCM ON" : "DESLIGADO"));
        addSys("> INFO DO CANAL: " + members + " membro(s), "
                + (encrypted ? "encriptado" : "sem encriptacao"));
    }

    @Override public void onMessage(String from, String content, long timestamp, boolean encrypted) {
        String text = content;
        if (encrypted) {
            String dec = crypto.decrypt(content);
            if (dec != null) {
                text = dec;
            }
        }
        addMsg(from, text, false, encrypted);
    }

    @Override public void onUserJoined(String nickname) {
        addSys("> " + nickname + " entrou no canal");
    }

    @Override public void onIrcStatus(String status, String detail) {
        addSys("> IRC [" + status + "] " + detail);
    }

    @Override public void onMeshEvent(String type, String detail) {
        addSys("> MESH [" + type + "] " + detail);
    }

    @Override protected void onDestroy() {
        super.onDestroy();
        gps.stop();
        client.disconnect();
    }
}
