// ============================================================
// BOUTONS PROFIL : ABONNEMENTS, ABONNÉS, J'AIME
// ============================================================

window.openFollowList = async function(type, userId) {
  if (!userId) return;
  const modal = document.getElementById('followListModal');
  const title = document.getElementById('followListTitle');
  const container = document.getElementById('followListContainer');

  title.textContent = type === 'following' ? window.t('subscriptions') : window.t('subscribers');
  modal.classList.add('active');
  container.innerHTML = `<p style="color:var(--muted); text-align:center; margin-top:20px;">${window.t('loading')}</p>`;

  try {
    // Utilisation de ta route /api/follows/
    const res = await fetch(`${window.API_URL}/api/follows/${type}/${userId}?myId=${window.currentUser.id}`);
    const data = await res.json();
    
    if (!data.success) throw new Error("Erreur");
    if (!data.users || data.users.length === 0) {
      container.innerHTML = `<p style="color:var(--muted); text-align:center; margin-top:20px; font-size:14px;">Aucun résultat.</p>`;
      return;
    }

    container.innerHTML = data.users.map(u => {
      const isMe = u.id === window.currentUser.id;
      const isFollowing = window.userFollowing.has(u.id);
      const avatar = u.avatar_url ? `<img src="${escapeHTML(u.avatar_url)}">` : '@';
      
      let btn = '';
      if (!isMe) {
        if (isFollowing) {
          btn = `<button class="follow-list-btn following" data-id="${u.id}">${window.t('following')}</button>`;
        } else {
          const label = (type === 'followers' || u.is_following_me) ? 'Suivre en retour' : window.t('follow');
          btn = `<button class="follow-list-btn" data-id="${u.id}">${label}</button>`;
        }
      }

      return `<div class="follow-list-item">
        <div class="follow-list-avatar" onclick="openProfile('${u.id}'); document.getElementById('followListModal').classList.remove('active');">${avatar}</div>
        <div class="follow-list-info" onclick="openProfile('${u.id}'); document.getElementById('followListModal').classList.remove('active');">
          <div class="follow-list-pseudo">@${escapeHTML(u.pseudo || 'anonyme')}</div>
        </div>
        ${btn}
      </div>`;
    }).join('');

    container.querySelectorAll('.follow-list-btn').forEach(btn => {
      btn.onclick = async (e) => {
        e.stopPropagation();
        const targetId = btn.dataset.id;
        const wasFollowing = window.userFollowing.has(targetId);
        
        btn.disabled = true;
        if (wasFollowing) {
          window.userFollowing.delete(targetId);
          btn.textContent = window.t('follow');
          btn.classList.remove('following');
        } else {
          window.userFollowing.add(targetId);
          btn.textContent = window.t('following');
          btn.classList.add('following');
        }

        try {
          const endpoint = wasFollowing ? '/api/unfollow' : '/api/follow';
          const res = await fetch(window.API_URL + endpoint, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ followerId: window.currentUser.id, followingId: targetId })
          });
          if (!res.ok) throw new Error();
          
          const stat = document.getElementById('statFollowing');
          if (stat) stat.textContent = window.formatNumber(window.userFollowing.size);
        } catch (err) {
          if (wasFollowing) { window.userFollowing.add(targetId); btn.textContent = window.t('following'); btn.classList.add('following'); }
          else { window.userFollowing.delete(targetId); btn.textContent = window.t('follow'); btn.classList.remove('following'); }
        } finally { btn.disabled = false; }
      };
    });

  } catch (e) {
    container.innerHTML = `<p style="color:var(--danger); text-align:center; margin-top:20px; font-size:14px;">Erreur de chargement.</p>`;
  }
};

// ============================================================
// BOUTON J'AIME : AFFICHER LA GRILLE DE VIDÉOS AIMÉES
// ============================================================
window.showProfileLikes = async function() {
  const userId = window.currentProfileUserId;
  if (!userId) return;

  document.querySelectorAll('.profile-tabs .tab-btn').forEach(b => b.classList.remove('active'));
  const likesTab = document.querySelector('.tab-btn[data-tab="likes"]');
  if (likesTab) likesTab.classList.add('active');

  const grid = document.getElementById('profileGrid');
  grid.innerHTML = `<p style="color:var(--muted); text-align:center; grid-column:1/-1; padding:20px;">${window.t('loading')}</p>`;

  try {
    // Utilisation de ta route /api/user/:id/likes
    const res = await fetch(`${window.API_URL}/api/user/${userId}/likes?myId=${window.currentUser.id}`);
    const data = await res.json();

    if (!data.success) throw new Error();
    if (!data.videos || data.videos.length === 0) {
      grid.innerHTML = `<p style="color:var(--muted); text-align:center; grid-column:1/-1; padding:20px;">Aucune vidéo aimée pour le moment.</p>`;
      return;
    }

    window.currentProfileVideos = data.videos;
    
    grid.innerHTML = data.videos.map(v => `
      <div class="profile-video-item" onclick="openVideoSwipe('${v.id}', '${v.user_id}', 'profile')">
        <video src="${escapeHTML(v.video_url)}" muted playsinline preload="metadata"></video>
        <div class="profile-video-stats"><span>▶ ${window.formatNumber(v.views_count || 0)}</span></div>
      </div>
    `).join('');

  } catch (e) {
    grid.innerHTML = `<p style="color:var(--danger); text-align:center; grid-column:1/-1; padding:20px;">Erreur de chargement.</p>`;
  }
};
