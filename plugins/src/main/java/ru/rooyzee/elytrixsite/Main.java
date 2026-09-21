package ru.rooyzee.elytrixsite;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;
import net.luckperms.api.LuckPerms;
import net.luckperms.api.LuckPermsProvider;
import org.bukkit.Bukkit;
import org.bukkit.command.*;
import org.bukkit.entity.Player;
import org.bukkit.event.*;
import org.bukkit.event.player.PlayerJoinEvent;
import org.bukkit.event.player.PlayerQuitEvent;
import org.bukkit.configuration.file.YamlConfiguration;
import org.bukkit.plugin.java.JavaPlugin;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.io.*;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.sql.*;
import java.util.*;
import java.util.concurrent.*;

public final class Main extends JavaPlugin implements Listener, CommandExecutor {

    private HikariDataSource pool;
    private HttpServer server;
    private String secret;
    private boolean mysqlOk = false;
    private LuckPerms luckPerms;
    private YamlConfiguration playtime;
    private File playtimeFile;
    private long lastRequest = 0;

    @Override
    public void onEnable() {
        saveDefaultConfig();
        playtimeFile = new File(getDataFolder(), "data.yml");
        playtime = YamlConfiguration.loadConfiguration(playtimeFile);
        setupMySQL();
        if (Bukkit.getPluginManager().getPlugin("LuckPerms") != null) {
            try {
                luckPerms = LuckPermsProvider.get();
                getLogger().info("LuckPerms hook enabled");
            } catch (IllegalStateException ex) {
                getLogger().warning("LuckPerms hook unavailable: " + ex.getMessage());
            }
        }
        Bukkit.getPluginManager().registerEvents(this, this);
        getCommand("elytrixsite").setExecutor(this);
        Bukkit.getScheduler().runTaskTimer(this, this::saveOnlinePlaytime, 1200L, 1200L);
        startHttp();
    }

    @Override
    public void onDisable() {
        saveOnlinePlaytime();
        if (server != null) server.stop(0);
        if (pool != null) pool.close();
    }

    private void setupMySQL() {
        try {
            var c = getConfig().getConfigurationSection("mysql");
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
        if (player.isOp()) return true;
        if (luckPerms == null) return false;
        try {
            String group = luckPerms.getUserManager().getUser(player.getUniqueId()).getPrimaryGroup();
            return group.equalsIgnoreCase("owner") || group.equalsIgnoreCase("admin");
        } catch (Exception ex) {
            getLogger().warning("LuckPerms group check failed: " + ex.getMessage());
            return false;
        }
    }

    @EventHandler
    public void join(PlayerJoinEvent e) {
        if (!isExcluded(e.getPlayer())) {
            givePending(e.getPlayer().getUniqueId().toString());
        }
    }

    @EventHandler
    public void quit(PlayerQuitEvent e) {
        savePlaytime(e.getPlayer());
    }

    private void saveOnlinePlaytime() {
        for (Player player : Bukkit.getOnlinePlayers()) savePlaytime(player);
    }

    private void savePlaytime(Player player) {
        if (isExcluded(player)) return;
        String path = "players." + player.getUniqueId();
        playtime.set(path + ".name", player.getName());
        playtime.set(path + ".minutes", playtime.getInt(path + ".minutes", 0) + 1);
        try { playtime.save(playtimeFile); }
        catch (IOException ex) { getLogger().warning("Cannot save data.yml: " + ex.getMessage()); }
    }

    private void resetPlaytime() throws IOException {
        playtime.set("players", null);
        playtime.save(playtimeFile);
    }

    private void givePending(String uuid) {
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
                        if (!cmd.isEmpty())
                            Bukkit.dispatchCommand(Bukkit.getConsoleSender(), cmd.replace("%player%", pl.getName()));
                    }
                    issuedIds.add(id);
                }
                markIssued(issuedIds);
            });
        });
    }

    private void markIssued(List<String> ids) {
        if (ids.isEmpty()) return;
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
            secret = getConfig().getString("api.secret");
            int port = getConfig().getInt("api.port");
            server = HttpServer.create(new InetSocketAddress(port), 0);

            server.createContext("/api/leaderboard-playtime", ex -> handle(ex, body -> {
                JsonArray result = new JsonArray();
                org.bukkit.configuration.ConfigurationSection players = playtime.getConfigurationSection("players");
                if (players == null) return result.toString();
                for (String uuid : players.getKeys(false)) {
                    Player online = Bukkit.getPlayer(UUID.fromString(uuid));
                    if (online != null && isExcluded(online)) continue;
                    String path = "players." + uuid;
                    JsonObject row = new JsonObject();
                    row.addProperty("name", playtime.getString(path + ".name", "Unknown"));
                    row.addProperty("seconds", playtime.getLong(path + ".minutes", 0) * 60L);
                    result.add(row);
                }
                List<JsonObject> rows = new ArrayList<>();
                result.forEach(x -> rows.add(x.getAsJsonObject()));
                rows.sort((a, b) -> Long.compare(b.get("seconds").getAsLong(), a.get("seconds").getAsLong()));
                JsonArray top = new JsonArray();
                rows.stream().limit(10).forEach(top::add);
                return top.toString();
            }));

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
        if (a.length == 1 && a[0].equalsIgnoreCase("reset-time")) {
            if (!s.hasPermission("elytrixsite.admin")) {
                s.sendMessage("§cНет permission: elytrixsite.admin");
                return true;
            }
            try {
                resetPlaytime();
                s.sendMessage("§aНаигранное время сброшено.");
            } catch (IOException ex) {
                s.sendMessage("§cНе удалось сохранить data.yml: " + ex.getMessage());
            }
            return true;
        }
        if (a.length == 1 && a[0].equalsIgnoreCase("status")) {
            s.sendMessage("MySQL: " + (mysqlOk ? "OK" : "ERROR"));
            s.sendMessage("API: " + (server != null ? "RUNNING" : "STOPPED"));
            s.sendMessage("Pool active/idle: " + (pool != null ? pool.getHikariPoolMXBean().getActiveConnections() + "/" + pool.getHikariPoolMXBean().getIdleConnections() : "N/A"));
            s.sendMessage("Last request: " + (lastRequest == 0 ? "NONE" : (System.currentTimeMillis() - lastRequest) + "ms ago"));
        }
        return true;
    }
}