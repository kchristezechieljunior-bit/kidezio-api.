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
        const body = await req.json();
        const { pseudo, password } = body;

        if (!pseudo || !password) throw new Error("Pseudo et mot de passe requis.");

        // Vérifier si le pseudo existe déjà
        const checkUser = await env.DB.prepare("SELECT id FROM users WHERE pseudo = ?").bind(pseudo).first();
        if (checkUser) throw new Error("Ce pseudo est déjà pris.");

        // Générer un ID unique et un code d'invitation
        const userId = crypto.randomUUID();
        const inviteCode = 'KID-' + Math.random().toString(36).substring(2, 8).toUpperCase();
        // (Pour l'instant on stocke le mot de passe en clair, on sécurisera plus tard)
        
        await env.DB.prepare(
          "INSERT INTO users (id, pseudo, email, password_hash, invite_code) VALUES (?, ?, ?, ?, ?)"
        ).bind(userId, pseudo, pseudo + "@kidezio.local", password, inviteCode).run();

        return new Response(JSON.stringify({ success: true, userId, pseudo, inviteCode }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // --- CONNEXION (Login) ---
      if (path === "/api/auth/login" && request.method === "POST") {
        const body = await req.json();
        const { pseudo, password } = body;

        const user = await env.DB.prepare("SELECT * FROM users WHERE pseudo = ? AND password_hash = ?").bind(pseudo, password).first();
        
        if (!user) throw new Error("Pseudo ou mot de passe incorrect.");

        return new Response(JSON.stringify({ success: true, user }), {
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
