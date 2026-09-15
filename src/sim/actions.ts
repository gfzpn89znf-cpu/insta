import { addLog, follow, pushNotification, unfollow } from './engine';
import { replyToUserComment } from './aiContent';
import { chance, clamp, randInt, rngFrom } from './rng';
import { followerCount } from './scoring';
import type { World } from './types';

/** Like setzen oder zuruecknehmen. */
export function toggleLike(world: World, postId: string): boolean {
  const post = world.posts[postId];
  const user = world.accounts[world.user.accountId];
  if (!post) return false;
  const liked = world.user.likedPosts.includes(postId);
  if (liked) {
    world.user.likedPosts = world.user.likedPosts.filter((id) => id !== postId);
    post.metrics.likes = Math.max(0, post.metrics.likes - 1);
    post.likedBy = post.likedBy.filter((id) => id !== user.id);
    return false;
  }
  world.user.likedPosts.push(postId);
  post.metrics.likes += 1;
  post.likedBy.unshift(user.id);

  // Kleine Accounts merken sich, wer sie unterstuetzt.
  const author = world.accounts[post.authorId];
  if (author && !author.isUser) {
    const rng = rngFrom(world.seed, 'like', postId, world.time);
    const size = followerCount(author);
    const p = clamp(author.traits.followBack * 0.06 * (1 - clamp(Math.log10(size + 10) / 6, 0, 0.95)), 0, 0.06);
    if (chance(rng, p) && !author.following.includes(user.id)) {
      follow(author, user);
      pushNotification(world, { kind: 'follow', actorId: author.id, text: 'folgt dir jetzt.' });
    }
  }
  return true;
}

export function toggleSave(world: World, postId: string): boolean {
  const post = world.posts[postId];
  if (!post) return false;
  const saved = world.user.savedPosts.includes(postId);
  if (saved) {
    world.user.savedPosts = world.user.savedPosts.filter((id) => id !== postId);
    post.metrics.saves = Math.max(0, post.metrics.saves - 1);
    return false;
  }
  world.user.savedPosts.push(postId);
  post.metrics.saves += 1;
  return true;
}

/**
 * Kommentieren ist der wirksamste kostenlose Wachstumshebel: Wer frueh unter
 * reichweitenstarken Posts sichtbar ist, wird selbst entdeckt.
 */
export function addUserComment(world: World, postId: string, text: string) {
  const post = world.posts[postId];
  const user = world.accounts[world.user.accountId];
  if (!post || !text.trim()) return;

  post.commentList.push({
    id: `c${world.counter++}`,
    authorId: user.id,
    text: text.trim().slice(0, 300),
    at: world.time,
    likes: 0,
  });
  post.metrics.comments += 1;
  if (!world.user.commentedPosts.includes(postId)) world.user.commentedPosts.push(postId);

  const author = world.accounts[post.authorId];
  if (!author || author.isUser) return;

  const rng = rngFrom(world.seed, 'comment', postId, world.time);
  const ageHours = (world.time - post.createdAt) / 60;
  // Frueh dran sein zahlt sich aus: spaetere Kommentare gehen unter.
  const earliness = clamp(1 - ageHours / 12, 0.05, 1);
  const visibility = Math.log10(post.metrics.impressions + 10) / 6;
  const quality = clamp(text.trim().length / 90, 0.15, 1);
  const gained = Math.round(visibility * earliness * quality * randInt(rng, 2, 26));
  if (gained > 0) {
    user.crowdFollowers += gained;
    addLog(world, 'growth', `Dein Kommentar unter einem Post von @${author.handle} hat dir ${gained} Follower gebracht.`);
  }

  // Der Autor reagiert - und folgt manchmal zurueck.
  const p = clamp(author.traits.followBack * 0.35 * earliness * (1 - clamp(Math.log10(followerCount(author) + 10) / 6.5, 0, 0.95)), 0, 0.3);
  if (chance(rng, p) && !author.following.includes(user.id)) {
    follow(author, user);
    pushNotification(world, { kind: 'follow', actorId: author.id, text: 'folgt dir jetzt.' });
  }

  // Und antwortet manchmal auf den Kommentar - mit echter KI, wenn vorhanden.
  if (chance(rng, clamp(0.25 + author.traits.sociability * 0.5, 0, 0.8))) {
    void replyToUserComment(world, post, text).then((answer) => {
      if (!answer) return;
      post.commentList.push({
        id: `c${world.counter++}`,
        authorId: author.id,
        text: answer.slice(0, 200),
        at: world.time,
        likes: 0,
        ai: true,
      });
      post.metrics.comments += 1;
      pushNotification(world, {
        kind: 'comment',
        actorId: author.id,
        postId: post.id,
        text: `hat dir geantwortet: "${answer.slice(0, 40)}"`,
      });
    });
  }
}

/** Antwort des Nutzers auf einen Kommentar unter dem eigenen Post. */
export function replyToComment(world: World, postId: string, commentId: string, text: string) {
  const post = world.posts[postId];
  const comment = post?.commentList.find((c) => c.id === commentId);
  if (!comment || !text.trim()) return;
  comment.reply = text.trim().slice(0, 300);
  const user = world.accounts[world.user.accountId];
  const rng = rngFrom(world.seed, 'reply', commentId);
  // Wer auf Kommentare antwortet, bindet sein Publikum.
  if (chance(rng, 0.45)) {
    user.crowdFollowers += randInt(rng, 1, 4);
  }
  world.user.reputation = clamp(world.user.reputation + 0.002, 0, 1);
}

/** Folgen/Entfolgen inklusive Rueckfolge-Logik. */
export function toggleFollow(world: World, accountId: string): boolean {
  const user = world.accounts[world.user.accountId];
  const target = world.accounts[accountId];
  if (!target || target.isUser) return false;

  if (user.following.includes(accountId)) {
    unfollow(user, target);
    return false;
  }
  follow(user, target);

  const rng = rngFrom(world.seed, 'followback', accountId, world.time);
  const size = followerCount(target);
  const mine = followerCount(user);
  // Grosse Accounts folgen fast nie zurueck, aehnlich grosse oft.
  const ratio = clamp(Math.log10((mine + 50) / (size + 50)) / 2 + 0.5, 0, 1);
  const p = clamp(target.traits.followBack * (0.15 + ratio * 0.75), 0, 0.85);
  if (chance(rng, p)) {
    follow(target, user);
    pushNotification(world, { kind: 'follow', actorId: target.id, text: 'folgt dir zurueck.' });
  }
  return true;
}

export function markStorySeen(world: World, accountId: string) {
  if (!world.user.seenStories.includes(accountId)) world.user.seenStories.push(accountId);
  if (world.user.seenStories.length > 300) world.user.seenStories.shift();
}

export function markNotificationsRead(world: World) {
  for (const n of world.notifications) n.read = true;
}

/** Profiltext oder Nische aendern - beeinflusst Auffindbarkeit und Bindung. */
export function updateProfile(world: World, patch: { name?: string; bio?: string; handle?: string }) {
  const user = world.accounts[world.user.accountId];
  if (patch.name) user.name = patch.name.slice(0, 40);
  if (patch.bio !== undefined) user.bio = patch.bio.slice(0, 160);
  if (patch.handle) user.handle = patch.handle.toLowerCase().replace(/[^a-z0-9._]/g, '').slice(0, 24);
}
