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

    try {
      // --- TEST API ---
      if (path === "/api/test" && request.method === "GET") {
        const { results } = await env.DB.prepare("SELECT COUNT(*) as count FROM users").all();
        return new Response(JSON.stringify({ success: true, message: "API connectée !", users_count: results[0].count }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // --- INSCRIPTION (Signup) ---
      if (path === "/api/auth/signup" && request.method === "POST") {
        const body = await request.json();
        const { pseudo, password } = body;
        if (!pseudo || !password) throw new Error("Pseudo et mot de passe requis.");

        const checkUser = await env.DB.prepare("SELECT id FROM users WHERE pseudo = ?").bind(pseudo).first();
        if (checkUser) throw new Error("Ce pseudo est déjà pris.");

        const userId = crypto.randomUUID();
        const inviteCode = 'KID-' + Math.random().toString(36).substring(2, 8).toUpperCase();
        
        await env.DB.prepare(
          "INSERT INTO users (id, pseudo, email, password_hash, invite_code) VALUES (?, ?, ?, ?, ?)"
        ).bind(userId, pseudo, pseudo + "@kidezio.local", password, inviteCode).run();

        return new Response(JSON.stringify({ success: true, userId, pseudo, inviteCode }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // --- CONNEXION (Login) ---
      if (path === "/api/auth/login" && request.method === "POST") {
        const body = await request.json();
        const { pseudo, password } = body;
        const user = await env.DB.prepare("SELECT * FROM users WHERE pseudo = ? AND password_hash = ?").bind(pseudo, password).first();
        if (!user) throw new Error("Pseudo ou mot de passe incorrect.");

        return new Response(JSON.stringify({ success: true, user }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // --- LISTE DES VIDÉOS (Feed) ---
      if (path === "/api/videos" && request.method === "GET") {
        const { results } = await env.DB.prepare(`
          SELECT v.*, u.pseudo, u.avatar_url,
                 (SELECT COUNT(*) FROM likes WHERE video_id = v.id) as likes_count,
                 (SELECT COUNT(*) FROM comments WHERE video_id = v.id) as comments_count
          FROM videos v
          JOIN users u ON v.user_id = u.id
          WHERE v.deleted_at IS NULL
          ORDER BY v.created_at DESC
          LIMIT 50
        `).all();
        return new Response(JSON.stringify({ success: true, videos: results }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // --- VIDÉOS D'UN UTILISATEUR (Profil) ---
if (path.startsWith("/api/user/") && path.endsWith("/videos") && request.method === "GET") {
  const userId = path.split("/")[3]; 
  const { results } = await env.DB.prepare(`
    SELECT v.*, 
           (SELECT COUNT(*) FROM likes WHERE video_id = v.id) as likes_count,
           (SELECT COUNT(*) FROM comments WHERE video_id = v.id) as comments_count
    FROM videos v
    WHERE v.user_id = ? AND v.deleted_at IS NULL
    ORDER BY v.created_at DESC
  `).bind(userId).all();
  
  return new Response(JSON.stringify({ success: true, videos: results }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

      // --- INFOS UTILISATEUR (Profil) ---
      if (path.startsWith("/api/user/") && request.method === "GET") {
        const userId = path.split("/")[3];
        const user = await env.DB.prepare("SELECT id, pseudo, bio, avatar_url, invite_code FROM users WHERE id = ?").bind(userId).first();
        if (!user) throw new Error("Utilisateur introuvable.");
        return new Response(JSON.stringify({ success: true, user }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // --- UPLOAD VIDÉO ---
      if (path === "/api/upload" && request.method === "POST") {
        const formData = await request.formData();
        const file = formData.get("video");
        const description = formData.get("description") || "";
        const music = formData.get("music") || "Son original";
        const userId = formData.get("userId");

        if (!file || !userId) throw new Error("Fichier ou utilisateur manquant.");

        const fileName = `videos/${userId}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.]/g, '')}`;
        
        await env.BUCKET.put(fileName, file.stream(), {
          httpMetadata: { contentType: file.type },
        });

        // ⚠️ METS TON URL R2 ICI
        const publicUrl = `https://pub-3219a17171b24ba58cf1972fa7300c60.r2.dev/${fileName}`; 

        const videoId = crypto.randomUUID();
        await env.DB.prepare(
          "INSERT INTO videos (id, user_id, video_url, description, music) VALUES (?, ?, ?, ?, ?)"
        ).bind(videoId, userId, publicUrl, description, music).run();

        return new Response(JSON.stringify({ success: true, videoId, url: publicUrl }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ error: "Route introuvable" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

    } catch (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  },
};
