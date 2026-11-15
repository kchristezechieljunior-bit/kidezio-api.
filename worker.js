export default {
  async fetch(request, env) {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    const jsonResponse = (data, status = 200) => {
      return new Response(JSON.stringify(data), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    };

    try {
      // ==========================================
      // AUTHENTIFICATION
      // ==========================================
      if (path === "/api/auth/signup" && request.method === "POST") {
        const { pseudo, password } = await request.json();
        const checkUser = await env.DB.prepare("SELECT id FROM users WHERE pseudo = ?").bind(pseudo).first();
        if (checkUser) throw new Error("Ce pseudo est déjà pris.");
        const userId = crypto.randomUUID();
        const inviteCode = 'KID-' + Math.random().toString(36).substring(2, 8).toUpperCase();
        await env.DB.prepare("INSERT INTO users (id, pseudo, email, password_hash, invite_code) VALUES (?, ?, ?, ?, ?)").bind(userId, pseudo, pseudo + "@kidezio.local", password, inviteCode).run();
        return jsonResponse({ success: true, userId, pseudo, inviteCode });
      }

      if (path === "/api/auth/login" && request.method === "POST") {
        const { pseudo, password } = await request.json();
        const user = await env.DB.prepare("SELECT * FROM users WHERE pseudo = ? AND password_hash = ?").bind(pseudo, password).first();
        if (!user) throw new Error("Pseudo ou mot de passe incorrect.");
        return jsonResponse({ success: true, user });
      }

      // ==========================================
      // FEED & VIDÉOS
      // ==========================================
      if (path === "/api/videos" && request.method === "GET") {
        const userId = url.searchParams.get('userId') || '';
        const sql = "SELECT v.*, u.pseudo, u.avatar_url, (SELECT COUNT(*) FROM likes WHERE video_id = v.id) as likes_count, (SELECT COUNT(*) FROM comments WHERE video_id = v.id) as comments_count, (SELECT COUNT(*) FROM views WHERE video_id = v.id) as views_count, (SELECT COUNT(*) FROM likes WHERE video_id = v.id AND user_id = ?) as is_liked, (SELECT COUNT(*) FROM reposts WHERE video_id = v.id) as reposts_count, (SELECT COUNT(*) FROM favorites WHERE video_id = v.id AND user_id = ?) as is_favorited FROM videos v JOIN users u ON v.user_id = u.id WHERE v.deleted_at IS NULL ORDER BY v.created_at DESC LIMIT 50";
        const { results } = await env.DB.prepare(sql).bind(userId, userId).all();
        return jsonResponse({ success: true, videos: results });
      }

      if (path === "/api/video/delete" && request.method === "POST") {
        const { videoId, userId } = await request.json();
        await env.DB.prepare("UPDATE videos SET deleted_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?").bind(videoId, userId).run();
        return jsonResponse({ success: true });
      }
      
      if (path === "/api/video/restore" && request.method === "POST") {
        const { videoId } = await request.json();
        await env.DB.prepare("UPDATE videos SET deleted_at = NULL WHERE id = ?").bind(videoId).run();
        return jsonResponse({ success: true });
      }

      // ==========================================
      // PROFIL & UTILISATEURS
      // ==========================================
      if (/^\/api\/user\/[a-zA-Z0-9-]+$/.test(path) && request.method === "GET") {
        const userId = path.split("/")[3];
        const user = await env.DB.prepare("SELECT id, pseudo, name, bio, avatar_url, invite_code, birthday FROM users WHERE id = ?").bind(userId).first();
        if (!user) throw new Error("Utilisateur introuvable");
        return jsonResponse({ success: true, user });
      }

      if (path === "/api/user/update" && request.method === "POST") {
        const { userId, bio, name, avatar_url, birthday, last_birthday_update } = await request.json();
        if (birthday && last_birthday_update) {
          await env.DB.prepare("UPDATE users SET bio = ?, name = ?, avatar_url = ?, birthday = ?, last_birthday_update = ? WHERE id = ?").bind(bio, name, avatar_url, birthday, last_birthday_update, userId).run();
        } else {
          await env.DB.prepare("UPDATE users SET bio = ?, name = ?, avatar_url = ? WHERE id = ?").bind(bio, name, avatar_url, userId).run();
        }
        return jsonResponse({ success: true });
      }
      
      if (path.startsWith("/api/user/") && path.endsWith("/videos") && request.method === "GET") {
        const userId = path.split("/")[3]; 
        const sql = "SELECT v.*, (SELECT COUNT(*) FROM likes WHERE video_id = v.id) as likes_count, (SELECT COUNT(*) FROM comments WHERE video_id = v.id) as comments_count, (SELECT COUNT(*) FROM views WHERE video_id = v.id) as views_count FROM videos v WHERE v.user_id = ? AND v.deleted_at IS NULL ORDER BY v.created_at DESC";
        const { results } = await env.DB.prepare(sql).bind(userId).all();
        return jsonResponse({ success: true, videos: results });
      }

      if (path.startsWith("/api/user/") && path.includes("/reposts")) {
        const userId = path.split("/")[3];
        const sql = "SELECT v.*, (SELECT COUNT(*) FROM likes WHERE video_id = v.id) as likes_count, (SELECT COUNT(*) FROM comments WHERE video_id = v.id) as comments_count, (SELECT COUNT(*) FROM views WHERE video_id = v.id) as views_count FROM reposts r JOIN videos v ON r.video_id = v.id WHERE r.user_id = ? AND v.deleted_at IS NULL ORDER BY r.created_at DESC";
        const { results } = await env.DB.prepare(sql).bind(userId).all();
        return jsonResponse({ success: true, videos: results });
      }
      
      if (path.startsWith("/api/user/") && path.includes("/favorites")) {
        const userId = path.split("/")[3];
        const sql = "SELECT v.*, (SELECT COUNT(*) FROM likes WHERE video_id = v.id) as likes_count, (SELECT COUNT(*) FROM comments WHERE video_id = v.id) as comments_count, (SELECT COUNT(*) FROM views WHERE video_id = v.id) as views_count FROM favorites f JOIN videos v ON f.video_id = v.id WHERE f.user_id = ? AND v.deleted_at IS NULL ORDER BY f.created_at DESC";
        const { results } = await env.DB.prepare(sql).bind(userId).all();
        return jsonResponse({ success: true, videos: results });
      }

      if (path.startsWith("/api/user/") && path.includes("/likes")) {
        const userId = path.split("/")[3];
        const sql = "SELECT v.*, (SELECT COUNT(*) FROM likes WHERE video_id = v.id) as likes_count, (SELECT COUNT(*) FROM comments WHERE video_id = v.id) as comments_count, (SELECT COUNT(*) FROM views WHERE video_id = v.id) as views_count, 1 as is_liked FROM likes l JOIN videos v ON l.video_id = v.id WHERE l.user_id = ? AND v.deleted_at IS NULL ORDER BY l.created_at DESC";
        const { results } = await env.DB.prepare(sql).bind(userId).all();
        return jsonResponse({ success: true, videos: results });
      }
      
      if (path.startsWith("/api/user/") && path.includes("/trash")) {
        const userId = path.split("/")[3];
        const sql = "SELECT v.*, (SELECT COUNT(*) FROM likes WHERE video_id = v.id) as likes_count, (SELECT COUNT(*) FROM comments WHERE video_id = v.id) as comments_count, (SELECT COUNT(*) FROM views WHERE video_id = v.id) as views_count FROM videos v WHERE v.user_id = ? AND v.deleted_at IS NOT NULL ORDER BY v.deleted_at DESC";
        const { results } = await env.DB.prepare(sql).bind(userId).all();
        return jsonResponse({ success: true, videos: results });
      }

      // ==========================================
      // FOLLOWS & BLOCAGES (MIS À JOUR)
      // ==========================================
      if (path === "/api/follow" && request.method === "POST") {
        const { followerId, followingId } = await request.json();
        await env.DB.prepare("INSERT INTO follows (id, follower_id, following_id) VALUES (?, ?, ?)").bind(crypto.randomUUID(), followerId, followingId).run();
        return jsonResponse({ success: true });
      }
      
      if (path === "/api/unfollow" && request.method === "POST") {
        const { followerId, followingId } = await request.json();
        await env.DB.prepare("DELETE FROM follows WHERE follower_id = ? AND following_id = ?").bind(followerId, followingId).run();
        return jsonResponse({ success: true });
      }

      if (path.startsWith("/api/follows/") && request.method === "GET") {
        const type = path.split("/")[3]; 
        const userId = path.split("/")[4];
        const myId = url.searchParams.get('myId') || '';
        
        let blockedIds = [];
        try {
          const blk = await env.DB.prepare("SELECT blocked_id AS id FROM blocked_users WHERE blocker_id = ? UNION SELECT blocker_id AS id FROM blocked_users WHERE blocked_id = ?").bind(myId, myId).all();
          blockedIds = blk.results.map(r => r.id);
        } catch(e) {}

        let query = '';
        let bindings = [];

        if (type === 'followers') {
          query = "SELECT u.id, u.pseudo, u.name, u.avatar_url, EXISTS(SELECT 1 FROM follows f2 WHERE f2.follower_id = u.id AND f2.following_id = ?) AS is_following_me FROM follows f JOIN users u ON f.follower_id = u.id WHERE f.following_id = ?";
          bindings = [myId, userId];
        } else {
          query = "SELECT u.id, u.pseudo, u.name, u.avatar_url, EXISTS(SELECT 1 FROM follows f2 WHERE f2.follower_id = u.id AND f2.following_id = ?) AS is_following_me FROM follows f JOIN users u ON f.following_id = u.id WHERE f.follower_id = ?";
          bindings = [myId, userId];
        }

        if (blockedIds.length > 0) {
           query += " AND u.id NOT IN (" + blockedIds.map(() => '?').join(',') + ")";
           bindings.push(...blockedIds); 
        }
        
        query += " ORDER BY f.created_at DESC LIMIT 50";

        const { results } = await env.DB.prepare(query).bind(...bindings).all();
        return jsonResponse({ success: true, users: results });
      }

      if (path === "/api/block" && request.method === "POST") {
        const { blockerId, blockedId } = await request.json();
        await env.DB.prepare("INSERT INTO blocked_users (id, blocker_id, blocked_id) VALUES (?, ?, ?)").bind(crypto.randomUUID(), blockerId, blockedId).run();
        return jsonResponse({ success: true });
      }
      
      if (path.startsWith("/api/blocked/") && request.method === "GET") {
        const userId = path.split("/")[3];
        const { results } = await env.DB.prepare("SELECT blocker_id, blocked_id FROM blocked_users WHERE blocker_id = ? OR blocked_id = ?").bind(userId, userId).all();
        return jsonResponse({ success: true, blocked: results });
      }

      // ==========================================
      // LIKES, VUES, COMMENTS, FAVS, REPOSTS
      // ==========================================
      if (path === "/api/like" && request.method === "POST") {
        const { userId, videoId } = await request.json();
        const existing = await env.DB.prepare("SELECT id FROM likes WHERE user_id = ? AND video_id = ?").bind(userId, videoId).first();
        if (existing) { await env.DB.prepare("DELETE FROM likes WHERE id = ?").bind(existing.id).run(); return jsonResponse({ success: true, action: "unliked" }); }
        else { await env.DB.prepare("INSERT INTO likes (id, user_id, video_id) VALUES (?, ?, ?)").bind(crypto.randomUUID(), userId, videoId).run(); return jsonResponse({ success: true, action: "liked" }); }
      }
      
      if (path === "/api/favorite" && request.method === "POST") {
        const { userId, videoId } = await request.json();
        const existing = await env.DB.prepare("SELECT id FROM favorites WHERE user_id = ? AND video_id = ?").bind(userId, videoId).first();
        if (existing) { await env.DB.prepare("DELETE FROM favorites WHERE id = ?").bind(existing.id).run(); return jsonResponse({ success: true, action: "unfaved" }); }
        else { await env.DB.prepare("INSERT INTO favorites (id, user_id, video_id) VALUES (?, ?, ?)").bind(crypto.randomUUID(), userId, videoId).run(); return jsonResponse({ success: true, action: "faved" }); }
      }

      if (path === "/api/repost" && request.method === "POST") {
        const { userId, videoId } = await request.json();
        const existing = await env.DB.prepare("SELECT id FROM reposts WHERE user_id = ? AND video_id = ?").bind(userId, videoId).first();
        if (existing) { await env.DB.prepare("DELETE FROM reposts WHERE id = ?").bind(existing.id).run(); return jsonResponse({ success: true, action: "unreposted" }); }
        else { await env.DB.prepare("INSERT INTO reposts (id, user_id, video_id) VALUES (?, ?, ?)").bind(crypto.randomUUID(), userId, videoId).run(); return jsonResponse({ success: true, action: "reposted" }); }
      }

      if (path === "/api/view" && request.method === "POST") {
        const { userId, videoId } = await request.json();
        await env.DB.prepare("INSERT INTO views (id, user_id, video_id) VALUES (?, ?, ?) ON CONFLICT(user_id, video_id) DO NOTHING").bind(crypto.randomUUID(), userId, videoId).run();
        return jsonResponse({ success: true });
      }
      
      if (path.startsWith("/api/comments/") && request.method === "GET") {
        const videoId = path.split("/")[3];
        const { results } = await env.DB.prepare("SELECT c.*, u.pseudo, u.avatar_url FROM comments c JOIN users u ON c.user_id = u.id WHERE c.video_id = ? ORDER BY c.created_at ASC").bind(videoId).all();
        return jsonResponse({ success: true, comments: results });
      }
      
      if (path === "/api/comments" && request.method === "POST") {
        const { videoId, userId, text, parentId } = await request.json();
        const commentId = crypto.randomUUID();
        await env.DB.prepare("INSERT INTO comments (id, video_id, user_id, text, parent_id) VALUES (?, ?, ?, ?, ?)").bind(commentId, videoId, userId, text, parentId).run();
        return jsonResponse({ success: true, id: commentId });
      }

      // ==========================================
      // CHAT
      // ==========================================
      if (path.startsWith("/api/messages/") && request.method === "GET") {
        const otherId = path.split("/")[3];
        const myId = url.searchParams.get('myId');
        const { results } = await env.DB.prepare("SELECT * FROM messages WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?) ORDER BY created_at ASC LIMIT 50").bind(myId, otherId, otherId, myId).all();
        return jsonResponse({ success: true, messages: results });
      }
      
      if (path === "/api/messages" && request.method === "POST") {
        const { sender_id, receiver_id, content } = await request.json();
        await env.DB.prepare("INSERT INTO messages (id, sender_id, receiver_id, content) VALUES (?, ?, ?, ?)").bind(crypto.randomUUID(), sender_id, receiver_id, content).run();
        return jsonResponse({ success: true });
      }

      // ==========================================
      // RECHERCHE, NOTIFICATIONS, CLASSEMENT
      // ==========================================
      if (path === "/api/search" && request.method === "GET") {
        const query = url.searchParams.get('q');
        const { results } = await env.DB.prepare("SELECT v.*, u.pseudo, u.avatar_url FROM videos v JOIN users u ON v.user_id = u.id WHERE v.description LIKE ? OR u.pseudo LIKE ? LIMIT 20").bind('%' + query + '%', '%' + query + '%').all();
        return jsonResponse({ success: true, videos: results });
      }
      
      if (path === "/api/notifications" && request.method === "GET") {
        return jsonResponse({ success: true, notifs: [] });
      }

      if (path === "/api/leaderboard" && request.method === "GET") {
        const { results } = await env.DB.prepare("SELECT u.id, u.pseudo, COUNT(f.id) as followers FROM users u LEFT JOIN follows f ON f.following_id = u.id GROUP BY u.id, u.pseudo ORDER BY followers DESC LIMIT 100").all();
        return jsonResponse({ success: true, leaderboard: results });
      }

      // ==========================================
      // UPLOAD
      // ==========================================
      if (path === "/api/upload-avatar" && request.method === "POST") {
        const formData = await request.formData();
        const file = formData.get("avatar");
        const userId = formData.get("userId");
        const fileName = "avatars/" + userId + "/" + Date.now() + "-" + file.name.replace(/[^a-zA-Z0-9.]/g, '');
        await env.BUCKET.put(fileName, file.stream(), { httpMetadata: { contentType: file.type } });
        const publicUrl = "https://pub-3219a17171b24ba58cf1972fa7300c60.r2.dev/" + fileName;
        await env.DB.prepare("UPDATE users SET avatar_url = ? WHERE id = ?").bind(publicUrl, userId).run();
        return jsonResponse({ success: true, url: publicUrl });
      }

      if (path === "/api/upload" && request.method === "POST") {
        const formData = await request.formData();
        const file = formData.get("video");
        const description = formData.get("description") || "";
        const music = formData.get("music") || "Son original";
        const userId = formData.get("userId");
        const fileName = "videos/" + userId + "/" + Date.now() + "-" + file.name.replace(/[^a-zA-Z0-9.]/g, '');
        await env.BUCKET.put(fileName, file.stream(), { httpMetadata: { contentType: file.type } });
        const publicUrl = "https://pub-3219a17171b24ba58cf1972fa7300c60.r2.dev/" + fileName;
        const videoId = crypto.randomUUID();
        await env.DB.prepare("INSERT INTO videos (id, user_id, video_url, description, music) VALUES (?, ?, ?, ?, ?)").bind(videoId, userId, publicUrl, description, music).run();
        return jsonResponse({ success: true, videoId, url: publicUrl });
      }

      return jsonResponse({ error: "Route introuvable" }, 404);

    } catch (error) {
      return jsonResponse({ error: error.message }, 400);
    }
  },
};
