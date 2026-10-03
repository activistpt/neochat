package pt.neochat.app;

import android.Manifest;
import android.content.Context;
import android.content.pm.PackageManager;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;

import java.util.ArrayList;
import java.util.List;

/**
 * GPS NATIVO.
 *
 * Posicao real do dispositivo + calculo de distancia (haversine) para as
 * cidades portuguesas, replicando o que o modulo web faz via /api/gps.
 */
public final class GpsLocator {

    public static final class City {
        public final String name;
        public final double lat;
        public final double lng;
        public final double distanceKm;   // -1 se desconhecido

        City(String name, double lat, double lng, double distanceKm) {
            this.name = name;
            this.lat = lat;
            this.lng = lng;
            this.distanceKm = distanceKm;
        }
    }

    public interface Callback {
        void onLocation(double lat, double lng, float accuracy, String provider);
        void onDenied();
    }

    private final Context ctx;
    private final LocationManager lm;
    private final Handler ui = new Handler(Looper.getMainLooper());
    private LocationListener active;

    /** Cidades portuguesas de referencia (coordenadas do modulo web). */
    private static final City[] PT_CITIES = {
            new City("Lisboa", 38.7223, -9.1393, -1),
            new City("Porto", 41.1579, -8.6291, -1),
            new City("Coimbra", 40.2033, -8.4103, -1),
            new City("Braga", 41.5454, -8.4265, -1),
            new City("Faro", 37.0194, -7.9304, -1),
            new City("Aveiro", 40.6405, -8.6538, -1),
            new City("Setubal", 38.5244, -8.8882, -1),
            new City("Braganca", 41.8057, -6.7566, -1),
            new City("Evora", 38.5714, -7.9135, -1),
            new City("Viana do Castelo", 41.6939, -8.8771, -1),
            new City("Leiria", 39.7436, -8.8071, -1),
            new City("Castelo Branco", 39.8222, -7.4906, -1),
            new City("Vila Real", 41.3015, -7.7442, -1),
            new City("Guarda", 40.5372, -7.2674, -1),
    };

    public GpsLocator(Context ctx) {
        this.ctx = ctx.getApplicationContext();
        this.lm = (LocationManager) ctx.getSystemService(Context.LOCATION_SERVICE);
    }

    public boolean hasPermission() {
        return ctx.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)
                == PackageManager.PERMISSION_GRANTED
                || ctx.checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION)
                == PackageManager.PERMISSION_GRANTED;
    }

    /** Ultima posicao conhecida, se houver. */
    public Location lastKnown() {
        if (lm == null || !hasPermission()) {
            return null;
        }
        try {
            List<String> providers = lm.getProviders(true);
            Location best = null;
            for (String p : providers) {
                Location l = lm.getLastKnownLocation(p);
                if (l != null && (best == null || l.getTime() > best.getTime())) {
                    best = l;
                }
            }
            return best;
        } catch (SecurityException e) {
            return null;
        }
    }

    /**
     * Pede uma actualizacao de posicao.
     * Chama {@code cb.onLocation} no thread principal, ou {@code cb.onDenied}.
     */
    public void requestSingle(Callback cb) {
        if (!hasPermission()) {
            ui.post(cb::onDenied);
            return;
        }
        if (lm == null) {
            ui.post(() -> cb.onDenied());
            return;
        }

        Location known = lastKnown();
        if (known != null && System.currentTimeMillis() - known.getTime() < 30000) {
            ui.post(() -> cb.onLocation(
                    known.getLatitude(), known.getLongitude(),
                    known.getAccuracy(), known.getProvider()));
        }

        LocationListener l = new LocationListener() {
            @Override public void onLocationChanged(Location location) {
                ui.post(() -> cb.onLocation(
                        location.getLatitude(), location.getLongitude(),
                        location.getAccuracy(), location.getProvider()));
                stop();
            }
            @Override public void onProviderDisabled(String p) { stop(); }
            @Override public void onProviderEnabled(String p) { }
            @Override public void onStatusChanged(String p, int s, Bundle b) { }
        };

        try {
            active = l;
            List<String> providers = lm.getProviders(true);
            if (providers.isEmpty()) {
                // GPS desligado: tenta ligar o provider de rede
                lm.requestLocationUpdates(LocationManager.NETWORK_PROVIDER, 0, 0, l);
            } else {
                for (String p : providers) {
                    lm.requestLocationUpdates(p, 0, 0, l);
                }
            }
            ui.postDelayed(this::stop, 15000);
        } catch (SecurityException e) {
            ui.post(cb::onDenied);
        } catch (Exception e) {
            ui.post(() -> cb.onLocation(0, 0, 0, "erro"));
        }
    }

    public void stop() {
        if (lm != null && active != null) {
            try {
                lm.removeUpdates(active);
            } catch (SecurityException ignored) {
            }
        }
        active = null;
    }

    /** Distancias as cidades portuguesas, da mais proxima para a mais longe. */
    public List<City> nearbyCities(double lat, double lng) {
        List<City> out = new ArrayList<>();
        if (lat == 0 && lng == 0) {
            for (City c : PT_CITIES) {
                out.add(new City(c.name, c.lat, c.lng, -1));
            }
            return out;
        }
        for (City c : PT_CITIES) {
            double d = haversineKm(lat, lng, c.lat, c.lng);
            out.add(new City(c.name, c.lat, c.lng, d));
        }
        out.sort((a, b) -> Double.compare(a.distanceKm, b.distanceKm));
        return out;
    }

    /** Distancia em linha recta entre dois pontos, em quilometros. */
    public static double haversineKm(double lat1, double lon1, double lat2, double lon2) {
        final double R = 6371.0;
        double dLat = Math.toRadians(lat2 - lat1);
        double dLon = Math.toRadians(lon2 - lon1);
        double a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
                + Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2))
                * Math.sin(dLon / 2) * Math.sin(dLon / 2);
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    /** Bearing (rumo) de (lat1,lon1) para (lat2,lon2), em graus 0-360. */
    public static double bearingDeg(double lat1, double lon1, double lat2, double lon2) {
        double dLon = Math.toRadians(lon2 - lon1);
        double y = Math.sin(dLon) * Math.cos(Math.toRadians(lat2));
        double x = Math.cos(Math.toRadians(lat1)) * Math.sin(Math.toRadians(lat2))
                - Math.sin(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2)) * Math.cos(dLon);
        double deg = Math.toDegrees(Math.atan2(y, x));
        return (deg + 360) % 360;
    }
}
