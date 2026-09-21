package ru.rooyzee.elytrixsite;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;
import net.luckperms.api.LuckPerms;
import net.luckperms.api.LuckPermsProvider;
import net.luckperms.api.model.user.User;
import net.luckperms.api.node.NodeType;
import net.luckperms.api.node.types.InheritanceNode;
import org.bukkit.Bukkit;
import org.bukkit.OfflinePlayer;
import org.bukkit.World;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.player.PlayerJoinEvent;
import org.bukkit.plugin.java.JavaPlugin;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.io.File;
import java.io.IOException;
import java.io.OutputStream;
import java.io.Reader;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.security.MessageDigest;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Base64;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

public final class Main extends JavaPlugin implements Listener, CommandExecutor {

    private static final List<String> DEFAULT_EXCLUDED_GROUPS = Arrays.asList(
            "default", "helper", "moder", "moderator", "curator", "kurator", "admin", "owner", "sradmin", "developer"
    );

    private HikariDataSource pool;
    private HttpServer server;
    private String secret;
    private boolean mysqlOk = false;
    private LuckPerms luckPerms;
    private long lastRequest = 0;

    @Override
    public void onEnable() {
        saveDefaultConfig();
        setupMySQL();
        setupLuckPerms();
        Bukkit.getPluginManager().registerEvents(this, this);
        if (getCommand("elytrixsite") != null) {
            getCommand("elytrixsite").setExecutor(this);
        }
        startHttp();
    }

    @Override
    public void onDisable() {
        if (server != null) server.stop(0);
        if (pool != null) pool.close();
    }

    private void setupLuckPerms() {
        if (Bukkit.getPluginManager().getPlugin("LuckPerms") == null) {
            getLogger().warning("LuckPerms не найден: топ активных будет пустым, чтобы не показывать default/staff.");
            return;
        }
        try {
            luckPerms = LuckPermsProvider.get();
            getLogger().info("LuckPerms hook enabled");
        } catch (IllegalStateException ex) {
            getLogger().warning("LuckPerms hook unavailable: " + ex.getMessage());
        }
    }

    private void setupMySQL() {
        try {
            org.bukkit.configuration.ConfigurationSection c = getConfig().getConfigurationSection("mysql");
            if (c == null) throw new IllegalStateException("mysql config section missing");

            String url = "jdbc:mysql://" + c.getString("host") + ":" + c.getInt("port")
                    + "/" + c.getString("database") + "?useSSL=false&autoReconnect=true";

            try { Class.forName("ru.rooyzee.elytrixsite.libs.mysql.cj.jdbc.Driver"); } catch (Throwable ignored) {}
            try { Class.forName("com.mysql.cj.jdbc.Driver"); } catch (Throwable ignored) {}

            HikariConfig hc = new HikariConfig();
            hc.setJdbcUrl(url);
            hc.setUsername(c.getString("user"));
            hc.setPassword(c.getString("password"));
            hc.setMaximumPoolSize(6);
            hc.setMinimumIdle(1);
            hc.setConnectionTimeout(5000);
            hc.setPoolName("ElytrixSitePool");
            pool = new HikariDataSource(hc);

            try (Connection conn = pool.getConnection(); Statement st = conn.createStatement()) {
                st.executeUpdate("CREATE TABLE IF NOT EXISTS orders(" +
                        "id VARCHAR(64) PRIMARY KEY," +
                        "player VARCHAR(36)," +
                        "commands TEXT," +
                        "issued BOOLEAN DEFAULT FALSE," +
                        "INDEX idx_player_issued(player, issued))");
            }
            mysqlOk = true;
            getLogger().info("MySQL connected");
        } catch (Exception e) {
            mysqlOk = false;
            getLogger().severe("MySQL error: " + e.getMessage());
        }
    }

    private boolean isExcluded(Player player) {
        if (player == null) return true;
        if (player.isOp()) return true;
        return !isAllowedByGroup(player.getUniqueId());
    }

    private boolean isAllowedByGroup(UUID uuid) {
        if (luckPerms == null || uuid == null) return false;
        try {
            User user = luckPerms.getUserManager().getUser(uuid);
            if (user == null) {
                user = luckPerms.getUserManager().loadUser(uuid).get(3, TimeUnit.SECONDS);
            }
            if (user == null) return false;
            String group = user.getPrimaryGroup();
            if (group == null || group.isBlank()) group = "default";
            group = group.toLowerCase(Locale.ROOT);

            Set<String> excluded = excludedGroups();
            if (excluded.contains(group)) return false;

            boolean hasPaidGroup = !"default".equals(group);
            for (InheritanceNode node : user.getNodes(NodeType.INHERITANCE)) {
                if (node == null || node.getGroupName() == null) continue;
                String inherited = node.getGroupName().toLowerCase(Locale.ROOT);
                if (excluded.contains(inherited)) return false;
                if (!"default".equals(inherited)) hasPaidGroup = true;
            }

            if (!getConfig().getBoolean("playtime.include-default", false) && !hasPaidGroup) return false;
            return true;
        } catch (Exception ex) {
            getLogger().warning("LuckPerms group check failed: " + ex.getMessage());
            return false;
        }
    }

    private Set<String> excludedGroups() {
        List<String> configured = getConfig().getStringList("playtime.exclude-groups");
        if (configured == null || configured.isEmpty()) configured = DEFAULT_EXCLUDED_GROUPS;
        Set<String> out = new HashSet<>();
        for (String group : configured) {
            if (group != null && !group.isBlank()) out.add(group.toLowerCase(Locale.ROOT));
        }
        return out;
    }

    @EventHandler
    public void join(PlayerJoinEvent e) {
        if (!isExcluded(e.getPlayer())) {
            givePending(e.getPlayer().getUniqueId().toString());
        }
    }

    private void givePending(String uuid) {
        if (!mysqlOk || pool == null) return;
        Bukkit.getScheduler().runTaskAsynchronously(this, () -> {
            List<String[]> toIssue = new ArrayList<>();
            try (Connection conn = pool.getConnection();
                 PreparedStatement ps = conn.prepareStatement(
                         "SELECT id, commands FROM orders WHERE player=? AND issued=FALSE")) {
                ps.setString(1, uuid);
                try (ResultSet rs = ps.executeQuery()) {
                    while (rs.next()) toIssue.add(new String[]{rs.getString(1), rs.getString(2)});
                }
            } catch (Exception ex) {
                getLogger().warning("givePending select: " + ex.getMessage());
                return;
            }
            if (toIssue.isEmpty()) return;

            Bukkit.getScheduler().runTask(this, () -> {
                Player pl;
                try { pl = Bukkit.getPlayer(UUID.fromString(uuid)); }
                catch (Exception ex) { return; }
                if (pl == null || !pl.isOnline()) return;

                List<String> issuedIds = new ArrayList<>();
                for (String[] row : toIssue) {
                    String id = row[0];
                    String cmds = row[1];
                    if (cmds == null) continue;
                    for (String cmd : cmds.split(";")) {
                        cmd = cmd.trim();
                        if (!cmd.isEmpty()) {
                            Bukkit.dispatchCommand(Bukkit.getConsoleSender(), cmd.replace("%player%", pl.getName()));
                        }
                    }
                    issuedIds.add(id);
                }
                markIssued(issuedIds);
            });
        });
    }

    private void markIssued(List<String> ids) {
        if (ids.isEmpty() || !mysqlOk || pool == null) return;
        Bukkit.getScheduler().runTaskAsynchronously(this, () -> {
            try (Connection conn = pool.getConnection();
                 PreparedStatement ps = conn.prepareStatement("UPDATE orders SET issued=TRUE WHERE id=?")) {
                for (String id : ids) {
                    ps.setString(1, id);
                    ps.addBatch();
                }
                ps.executeBatch();
            } catch (Exception e) {
                getLogger().warning("markIssued: " + e.getMessage());
            }
        });
    }

    private void startHttp() {
        try {
            secret = getConfig().getString("api.secret", "");
            int port = getConfig().getInt("api.port", 20559);
            server = HttpServer.create(new InetSocketAddress(port), 0);

            server.createContext("/api/leaderboard-playtime", ex -> handle(ex, body -> buildPlaytimeTop().toString()));
            server.createContext("/api/clans/top", ex -> handle(ex, body -> buildClanTop().toString()));

            server.createContext("/api/check-player", ex -> handle(ex, body -> {
                String name = body.trim();
                if (!name.matches("^[a-zA-Z0-9_]{2,16}$")) return "NO";
                try {
                    return Bukkit.getScheduler().callSyncMethod(this,
                            () -> Bukkit.getPlayerExact(name) != null ? "OK" : "NO"
                    ).get(3, TimeUnit.SECONDS);
                } catch (Exception e) {
                    return "NO";
                }
            }));

            server.createContext("/api/complete-order", ex -> handle(ex, body -> {
                if (!mysqlOk || pool == null) return "ERR";
                try {
                    JsonObject j = new JsonParser().parse(body).getAsJsonObject();
                    String id = j.get("id").getAsString();
                    String player = j.get("player").getAsString();
                    String cmds = j.get("commands").getAsString();
                    if (!id.matches("^[a-zA-Z0-9-]{1,64}$")) return "BAD_ID";
                    if (!player.matches("^[a-zA-Z0-9_]{2,16}$")) return "BAD_PLAYER";

                    String uuid = Bukkit.getScheduler().callSyncMethod(this, () -> {
                        Player p = Bukkit.getPlayerExact(player);
                        if (p != null) return p.getUniqueId().toString();
                        return Bukkit.getOfflinePlayer(player).getUniqueId().toString();
                    }).get(3, TimeUnit.SECONDS);

                    try (Connection conn = pool.getConnection();
                         PreparedStatement ps = conn.prepareStatement(
                                 "INSERT IGNORE INTO orders(id, player, commands, issued) VALUES(?,?,?,FALSE)")) {
                        ps.setString(1, id);
                        ps.setString(2, uuid);
                        ps.setString(3, cmds);
                        ps.executeUpdate();
                    }
                    givePending(uuid);
                    return "OK";
                } catch (Exception e) {
                    getLogger().warning("complete-order: " + e.getMessage());
                    return "ERR";
                }
            }));

            server.setExecutor(Executors.newFixedThreadPool(8));
            server.start();
            getLogger().info("API started on port " + port);
        } catch (Exception e) {
            server = null;
            getLogger().severe("API error: " + e.getMessage());
        }
    }

    private JsonArray buildPlaytimeTop() {
        List<JsonObject> rows = new ArrayList<>();
        File statsDir = statsDirectory();
        File[] files = statsDir != null ? statsDir.listFiles((dir, name) -> name.endsWith(".json")) : null;
        if (files == null) return new JsonArray();

        for (File file : files) {
            UUID uuid = uuidFromStatsFile(file.getName());
            if (uuid == null || !isAllowedByGroup(uuid)) continue;

            long seconds = readPlaytimeSeconds(file);
            if (seconds <= 0) continue;

            String name = playerName(uuid);
            if (name == null || name.isBlank()) continue;

            JsonObject row = new JsonObject();
            row.addProperty("name", name);
            row.addProperty("seconds", seconds);
            rows.add(row);
        }

        rows.sort((a, b) -> Long.compare(b.get("seconds").getAsLong(), a.get("seconds").getAsLong()));
        JsonArray top = new JsonArray();
        int limit = Math.max(1, getConfig().getInt("playtime.limit", 10));
        rows.stream().limit(limit).forEach(top::add);
        return top;
    }

    private File statsDirectory() {
        String configured = getConfig().getString("playtime.world", "world");
        World world = Bukkit.getWorld(configured);
        File folder = world != null ? world.getWorldFolder() : new File(configured);
        return new File(folder, "stats");
    }

    private UUID uuidFromStatsFile(String name) {
        try {
            if (name == null || !name.endsWith(".json")) return null;
            return UUID.fromString(name.substring(0, name.length() - 5));
        } catch (Exception ignored) {
            return null;
        }
    }

    private long readPlaytimeSeconds(File file) {
        try (Reader reader = Files.newBufferedReader(file.toPath(), StandardCharsets.UTF_8)) {
            JsonObject root = new JsonParser().parse(reader).getAsJsonObject();
            JsonObject stats = object(root, "stats");
            JsonObject custom = object(stats, "minecraft:custom");
            long ticks = longValue(custom, "minecraft:play_time");
            if (ticks <= 0) ticks = longValue(custom, "minecraft:play_one_minute");
            return Math.max(0L, ticks / 20L);
        } catch (Exception ignored) {
            return 0L;
        }
    }

    private String playerName(UUID uuid) {
        try {
            Player online = Bukkit.getPlayer(uuid);
            if (online != null) return online.getName();
            OfflinePlayer offline = Bukkit.getOfflinePlayer(uuid);
            if (offline.isOp()) return null;
            return offline.getName();
        } catch (Exception ignored) {
            return null;
        }
    }

    private JsonObject buildClanTop() {
        JsonObject out = emptyClanTop();
        File file = clanExportFile();
        if (file == null || !file.isFile()) return out;

        try (Reader reader = Files.newBufferedReader(file.toPath(), StandardCharsets.UTF_8)) {
            JsonObject raw = new JsonParser().parse(reader).getAsJsonObject();
            JsonArray source = raw.has("clans") && raw.get("clans").isJsonArray()
                    ? raw.getAsJsonArray("clans") : new JsonArray();

            List<JsonObject> rows = new ArrayList<>();
            for (JsonElement element : source) {
                if (element != null && element.isJsonObject()) rows.add(element.getAsJsonObject());
            }
            rows.sort((a, b) -> Double.compare(doubleValue(b, "exp"), doubleValue(a, "exp")));

            JsonArray clans = new JsonArray();
            int limit = Math.max(1, getConfig().getInt("clans.limit", 10));
            int place = 1;
            for (JsonObject clan : rows) {
                if (place > limit) break;
                double exp = doubleValue(clan, "exp");
                JsonObject row = new JsonObject();
                row.addProperty("place", place++);
                row.addProperty("name", stringValue(clan, "name"));
                row.addProperty("owner", stringValue(clan, "owner"));
                row.addProperty("exp", exp);
                row.addProperty("level", intValue(clan, "level"));
                row.addProperty("members_count", intValue(clan, "members_count"));
                clans.add(row);
            }

            out.addProperty("generated_at", raw.has("generated_at") ? raw.get("generated_at").getAsLong() : System.currentTimeMillis());
            out.addProperty("count", clans.size());
            out.add("clans", clans);
            return out;
        } catch (Exception e) {
            getLogger().warning("clans/top read failed: " + e.getMessage());
            return out;
        }
    }

    private JsonObject emptyClanTop() {
        JsonObject out = new JsonObject();
        out.addProperty("generated_at", System.currentTimeMillis());
        out.addProperty("count", 0);
        out.add("clans", new JsonArray());
        return out;
    }

    private File clanExportFile() {
        String configured = getConfig().getString("clans.export-file", "plugins/ElytrixClans/export/clans.json");
        File file = new File(configured);
        return file.isAbsolute() ? file : new File(file.getPath());
    }

    private JsonObject object(JsonObject parent, String key) {
        if (parent == null || !parent.has(key) || !parent.get(key).isJsonObject()) return new JsonObject();
        return parent.getAsJsonObject(key);
    }

    private long longValue(JsonObject object, String key) {
        try {
            if (object != null && object.has(key)) return object.get(key).getAsLong();
        } catch (Exception ignored) {}
        return 0L;
    }

    private double doubleValue(JsonObject object, String key) {
        try {
            if (object != null && object.has(key)) return object.get(key).getAsDouble();
        } catch (Exception ignored) {}
        return 0.0;
    }

    private int intValue(JsonObject object, String key) {
        try {
            if (object != null && object.has(key)) return object.get(key).getAsInt();
        } catch (Exception ignored) {}
        return 0;
    }

    private String stringValue(JsonObject object, String key) {
        try {
            if (object != null && object.has(key) && !object.get(key).isJsonNull()) return object.get(key).getAsString();
        } catch (Exception ignored) {}
        return "";
    }

    private void handle(HttpExchange ex, java.util.function.Function<String, String> fn) throws IOException {
        lastRequest = System.currentTimeMillis();
        String ip = ex.getRemoteAddress().getAddress().getHostAddress();
        List<String> whitelist = getConfig().getStringList("api.ip-whitelist");
        if (!whitelist.isEmpty() && !whitelist.contains(ip)) {
            ex.sendResponseHeaders(403, -1); ex.close(); return;
        }
        byte[] body = ex.getRequestBody().readAllBytes();
        String sign = ex.getRequestHeaders().getFirst("X-Signature");
        String calc = hmac(body);
        if (sign == null || !MessageDigest.isEqual(
                sign.getBytes(StandardCharsets.UTF_8),
                calc.getBytes(StandardCharsets.UTF_8))) {
            ex.sendResponseHeaders(403, -1); ex.close(); return;
        }
        String result = fn.apply(new String(body, StandardCharsets.UTF_8));
        byte[] resp = result.getBytes(StandardCharsets.UTF_8);
        ex.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
        ex.sendResponseHeaders(200, resp.length);
        try (OutputStream os = ex.getResponseBody()) { os.write(resp); }
    }

    private String hmac(byte[] data) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            return Base64.getEncoder().encodeToString(mac.doFinal(data));
        } catch (Exception e) { return ""; }
    }

    @Override
    public boolean onCommand(CommandSender s, Command c, String l, String[] a) {
        if (a.length == 1 && a[0].equalsIgnoreCase("status")) {
            s.sendMessage("MySQL: " + (mysqlOk ? "OK" : "ERROR"));
            s.sendMessage("API: " + (server != null ? "RUNNING" : "STOPPED"));
            s.sendMessage("LuckPerms: " + (luckPerms != null ? "OK" : "ERROR"));
            s.sendMessage("Stats dir: " + statsDirectory().getPath());
            s.sendMessage("Clans export: " + clanExportFile().getPath());
            s.sendMessage("Pool active/idle: " + (pool != null ? pool.getHikariPoolMXBean().getActiveConnections() + "/" + pool.getHikariPoolMXBean().getIdleConnections() : "N/A"));
            s.sendMessage("Last request: " + (lastRequest == 0 ? "NONE" : (System.currentTimeMillis() - lastRequest) + "ms ago"));
            return true;
        }
        if (a.length == 1 && a[0].equalsIgnoreCase("reset-time")) {
            s.sendMessage("§eТоп активных теперь берётся из vanilla stats/world/stats, ElytrixSite его не собирает.");
            return true;
        }
        s.sendMessage("§c/elytrixsite status");
        return true;
    }
}
