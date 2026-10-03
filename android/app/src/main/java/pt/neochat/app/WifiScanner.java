package pt.neochat.app;

import android.content.Context;
import android.net.wifi.WifiInfo;
import android.net.wifi.WifiManager;
import android.os.Build;

import java.util.ArrayList;
import java.util.List;

/**
 * Scanner WiFi NATIVO.
 *
 * Le as redes realmente visiveis no dispositivo, ao contrario do modulo web
 * que consulta uma base de dados de redes publicas portuguesas.
 */
public final class WifiScanner {

    public static final class Result {
        public final String ssid;
        public final String bssid;
        public final int level;       // dBm
        public final int frequency;   // MHz
        public final String security;

        Result(String ssid, String bssid, int level, int frequency, String security) {
            this.ssid = ssid;
            this.bssid = bssid;
            this.level = level;
            this.frequency = frequency;
            this.security = security;
        }

        /** 0-4, quanto mais perto do sem-sinal pior (mesma logica do cliente web). */
        public int bars() {
            if (level >= -55) return 4;
            if (level >= -67) return 3;
            if (level >= -78) return 2;
            if (level >= -90) return 1;
            return 0;
        }
    }

    private final Context ctx;

    public WifiScanner(Context ctx) {
        this.ctx = ctx.getApplicationContext();
    }

    public boolean isAvailable() {
        try {
            return ctx.getPackageManager().hasSystemFeature(
                    android.content.pm.PackageManager.FEATURE_WIFI);
        } catch (Exception e) {
            return false;
        }
    }

    /** Rede a que o dispositivo esta ligado. */
    public Result currentNetwork() {
        try {
            WifiManager wm = (WifiManager) ctx.getSystemService(Context.WIFI_SERVICE);
            if (wm == null) {
                return null;
            }
            WifiInfo info = wm.getConnectionInfo();
            if (info == null) {
                return null;
            }
            String ssid = info.getSSID();
            if (ssid == null) {
                return null;
            }
            ssid = stripQuotes(ssid);
            int level = info.getRssi();
            int freq = info.getFrequency();
            return new Result(ssid, info.getBSSID(), level, freq, "?");
        } catch (Exception e) {
            return null;
        }
    }

    /**
     * Lista as redes visiveis.
     *
     * A partir do Android 8.1 a API de scan foi restringida a quem tem
     * permissao de localizacao; tentamos o scan nativo e, se nao devolver
     * nada, devolvemos apenas a rede actual (comportamento honesto).
     */
    public List<Result> scan() {
        List<Result> out = new ArrayList<>();
        Result cur = currentNetwork();
        if (cur != null) {
            out.add(cur);
        }

        try {
            WifiManager wm = (WifiManager) ctx.getSystemService(Context.WIFI_SERVICE);
            if (wm == null) {
                return out;
            }
            // startScan() e deprecated e so funciona com permissao de localizacao
            @SuppressWarnings("deprecation")
            boolean started = wm.startScan();
            if (!started) {
                return out;
            }
            Thread.sleep(2500);

            java.util.List<android.net.wifi.ScanResult> results = wm.getScanResults();
            if (results == null) {
                return out;
            }
            for (android.net.wifi.ScanResult r : results) {
                if (r.SSID == null) {
                    continue;
                }
                Result res = new Result(
                        stripQuotes(r.SSID),
                        r.BSSID,
                        r.level,
                        r.frequency,
                        capabilitiesToSecurity(r.capabilities));
                boolean dup = false;
                for (Result existing : out) {
                    if (existing.bssid != null && existing.bssid.equals(res.bssid)) {
                        dup = true;
                        break;
                    }
                }
                if (!dup) {
                    out.add(res);
                }
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        } catch (SecurityException e) {
            // sem permissao de localizacao: devolve so a rede actual
        } catch (Exception e) {
            // falha silenciosa
        }

        out.sort((a, b) -> Integer.compare(b.level, a.level));
        return out;
    }

    private static String stripQuotes(String s) {
        if (s == null) {
            return null;
        }
        if (s.length() >= 2 && s.charAt(0) == '"' && s.charAt(s.length() - 1) == '"') {
            return s.substring(1, s.length() - 1);
        }
        return s;
    }

    private static String capabilitiesToSecurity(String caps) {
        if (caps == null || caps.isEmpty()) {
            return "ABERTA";
        }
        String c = caps.toUpperCase();
        if (c.contains("WPA3") || c.contains("SAE")) {
            return "WPA3";
        }
        if (c.contains("WPA2") || c.contains("RSN")) {
            return "WPA2";
        }
        if (c.contains("WPA")) {
            return "WPA";
        }
        if (c.contains("WEP")) {
            return "WEP";
        }
        return "ABERTA";
    }
}
