import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { collection, getDocs, limit, query, where } from 'firebase/firestore';
import { auth, db } from '../firebase/config';
import { addComment, getComments, toggleLikePost } from '../services/communityService';
import { recordProductAction } from '../services/productActionService';
import { getOrCreateNickname, incrementCommentCount } from '../services/firestore/userRepository';
import { getMockGamification } from '../utils/gamification';
import { searchCoupangProducts } from '../services/coupangApiService';
import { generateProductTags } from '../services/productTagService';

// ─── Timestamp helper ─────────────────────────────────────────────────────────
//  • Today   → "방금 전" / "N분 전" / "HH:MM"
//  • Past    → "YYYY. M. D."

function formatPostTime(date) {
  if (!date) return '';
  const now  = new Date();
  const diff = (now.getTime() - date.getTime()) / 1000;

  const isSameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth()    === now.getMonth()    &&
    date.getDate()     === now.getDate();

  if (isSameDay) {
    if (diff < 60)   return '방금 전';
    if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
    const hh = String(date.getHours()).padStart(2, '0');
    const mm = String(date.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  }

  return `${date.getFullYear()}. ${date.getMonth() + 1}. ${date.getDate()}.`;
}

// Accepts a Firestore Timestamp, JS Date, or ISO string
function parseDate(value) {
  if (!value) return null;
  if (typeof value?.toDate === 'function') return value.toDate();
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

// ─── Category tag colours ─────────────────────────────────────────────────────

const TAG_COLORS = {
  question: { bg: '#eff6ff', text: '#2563eb' },
  tip:      { bg: '#f0fdf4', text: '#16a34a' },
  deal:     { bg: '#fef3c7', text: '#b45309' },
  review:   { bg: '#fce7f3', text: '#9d174d' },
  free:     { bg: '#f1f5f9', text: '#475569' },
  region:   { bg: '#f5f3ff', text: '#7c3aed' },
};
const TAG_LABEL = { free: '자유', question: '질문', review: '후기', deal: '핫딜', tip: '꿀팁', region: '지역' };

// ─── Gamification UI helper ───────────────────────────────────────────────────
// GamPill renders any { label, bg, text } from TIER_LIST or BADGE_LIST.

function GamPill({ item: pill }) {
  if (!pill) return null;
  return (
    <View style={[styles.badgePill, { backgroundColor: pill.bg }]}>
      <Text style={[styles.badgePillText, { color: pill.text }]}>{pill.label}</Text>
    </View>
  );
}

// ─── Keyword extractor ────────────────────────────────────────────────────────

const KEYWORD_HINTS = [
  ['기저귀', ['기저귀']],
  ['분유', ['분유']],
  ['물티슈', ['물티슈']],
  ['이유식', ['이유식']],
  ['유모차', ['유모차']],
  ['장난감', ['장난감', '놀이']],
  ['카시트', ['카시트']],
  ['젖병', ['젖병']],
  ['아기띠', ['아기띠']],
];

function extractKeyword(text) {
  const lower = (text || '').toLowerCase();
  for (const [keyword, hints] of KEYWORD_HINTS) {
    if (hints.some((h) => lower.includes(h))) return keyword;
  }
  return '육아용품';
}

// ─── Peer scoring helpers ─────────────────────────────────────────────────────

async function fetchChildStage(uid) {
  if (!uid) return null;
  try {
    const snap = await getDocs(
      query(collection(db, 'children'), where('userId', '==', uid), limit(1))
    );
    return snap.empty ? null : snap.docs[0].data().stage ?? null;
  } catch (_) {
    return null;
  }
}

// Returns a map of { productGroupId → weighted action count } for same-stage peers.
async function fetchPeerCounts(stage) {
  if (!stage) return {};
  try {
    const childSnap = await getDocs(
      query(collection(db, 'children'), where('stage', '==', stage), limit(50))
    );
    const peerUids = [...new Set(childSnap.docs.map((d) => d.data().userId).filter(Boolean))];
    if (peerUids.length === 0) return {};

    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000; // 30-day window
    const counts = {};
    const chunks = [];
    for (let i = 0; i < Math.min(peerUids.length, 30); i += 10) {
      chunks.push(peerUids.slice(i, i + 10));
    }
    await Promise.all(
      chunks.map((chunk) =>
        getDocs(
          query(collection(db, 'user_product_actions'), where('userId', 'in', chunk))
        ).then((snap) => {
          snap.docs.forEach((d) => {
            const { productGroupId, productId, actionType, createdAt } = d.data();
            const pid = productGroupId || productId;
            if (!pid) return;
            if ((createdAt?.toMillis?.() ?? 0) < cutoff) return;
            const w =
              actionType === 'product_purchase_click' || actionType === 'purchase' ? 3 : 1;
            counts[pid] = (counts[pid] ?? 0) + w;
          });
        })
      )
    );
    return counts;
  } catch (_) {
    return {};
  }
}

// ─── Context-to-Commerce: Firestore product matching ─────────────────────────
//
// Uses productTagService.generateProductTags to derive categoryTags + stageTags
// from the post text, then queries active Firestore products and scores them by
// peer action counts. Falls back to Coupang search only if Firestore returns 0 matches.
//
// Steps:
//   1. generateProductTags({ name: postText }) → { categoryTags, stageTags }
//   2. getDocs(products, status==active, limit 50) — same pattern as recommendationService
//   3. Client-side filter: categoryTags match OR stageTags match child's stage
//   4. Score by peerCounts, sort desc, take top 3

async function fetchContextualProducts(postText, childStage, peerCounts) {
  const { categoryTags, stageTags: postStageTags } = generateProductTags({ name: postText });
  const snap = await getDocs(
    query(collection(db, 'products'), where('status', '==', 'active'), limit(50))
  );

  // Stage priority: child's actual stage → stage hints from post text → none
  const targetStages = childStage ? [childStage] : postStageTags;
  const catSet = new Set(categoryTags.filter((c) => c !== 'general'));

  const matched = snap.docs
    .map((d) => ({ productId: d.id, ...d.data() }))
    .filter((p) => {
      if (p.isOutOfStock === true) return false;
      const pCats = Array.isArray(p.categoryTags) ? p.categoryTags : [];
      const pStages = Array.isArray(p.stageTags) ? p.stageTags : [];
      const catMatch = catSet.size === 0 || pCats.some((c) => catSet.has(c));
      const stageOk = targetStages.length === 0 || pStages.some((s) => targetStages.includes(s));
      return catMatch && stageOk;
    })
    .map((p) => ({ ...p, peerScore: peerCounts[p.productId] ?? peerCounts[p.productGroupId] ?? 0 }))
    .sort((a, b) => b.peerScore - a.peerScore)
    .slice(0, 3);

  return matched;
}

// ─── Comment component ────────────────────────────────────────────────────────

function CommentItem({ item }) {
  const date    = parseDate(item.createdAt);
  const timeStr = date ? formatPostTime(date) : '';
  const initial = (item.nickname || '익')[0];
  // Use userId when present (live comments); fall back to nickname (legacy/mock)
  const gam     = getMockGamification(item.userId || item.nickname);

  return (
    <View style={styles.comment}>
      {/* Author row */}
      <View style={styles.commentHeader}>
        <View style={styles.commentAvatar}>
          <Text style={styles.commentAvatarChar}>{initial}</Text>
        </View>
        <View style={styles.commentAuthorInfo}>
          <View style={styles.commentAuthorRow}>
            <GamPill item={gam.tier} />
            <GamPill item={gam.badge} />
            <Text style={styles.commentAuthor}>{item.nickname || '익명'}</Text>
          </View>
          {timeStr ? <Text style={styles.commentDate}>{timeStr}</Text> : null}
        </View>
      </View>
      {/* Content */}
      <Text style={styles.commentContent}>{item.content}</Text>
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function PostDetailScreen({ route, navigation }) {
  const { postId, title, category } = route.params;
  const showProminent = category === 'review' || category === 'question';
  // Use userId for live posts; fall back to nickname — same key as CommunityListScreen uses
  const postGam = getMockGamification(route.params.userId || route.params.nickname);

  const uid = auth.currentUser?.uid;
  const initialLikedBy = route.params.likedBy ?? [];

  const [comments,        setComments]        = useState([]);
  const [loading,         setLoading]          = useState(true);
  const [likeCount,       setLikeCount]        = useState(route.params.likeCount ?? 0);
  const [isLiked,         setIsLiked]          = useState(uid ? initialLikedBy.includes(uid) : false);
  const [likeSubmitting,  setLikeSubmitting]   = useState(false);
  const [commentText,     setCommentText]      = useState('');
  const [submitting,      setSubmitting]       = useState(false);
  const [relatedProducts, setRelatedProducts]  = useState([]);
  const [peerBased,       setPeerBased]        = useState(false);
  const [productsLoading, setProductsLoading]  = useState(true);
  const [userNickname,    setUserNickname]      = useState('');
  const inputRef = useRef(null);

  const imageUrls = route.params.imageUrls ?? [];

  useEffect(() => {
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      navigation.goBack();
      return true;
    });
    return () => backHandler.remove();
  }, [navigation]);

  useEffect(() => {
    if (uid) {
      getOrCreateNickname(uid).then(setUserNickname).catch(() => {});
    }

    getComments(postId)
      .then(setComments)
      .catch(console.error)
      .finally(() => setLoading(false));

    // ── Context-to-Commerce: tag-based Firestore matching ──
    if (uid) {
      recordProductAction({
        userId: uid,
        actionType: 'post_view',
        productId: null,
        postId,
      }).catch(() => {});
    }

    const postText = `${title} ${route.params.content || ''}`;
    setProductsLoading(true);
    fetchChildStage(uid)
      .then(async (stage) => {
        const peerCounts = await fetchPeerCounts(stage);
        const firestoreItems = await fetchContextualProducts(postText, stage, peerCounts);
        if (firestoreItems.length > 0) {
          setRelatedProducts(firestoreItems);
          setPeerBased(stage != null && firestoreItems.some((p) => p.peerScore > 0));
        } else {
          // Fallback: Coupang keyword search when no Firestore products match yet
          const keyword = extractKeyword(postText);
          const candidates = await searchCoupangProducts(keyword, 10).catch(() => []);
          const scored = candidates.map((p) => ({
            ...p,
            peerScore: peerCounts[p.productGroupId] ?? 0,
          }));
          scored.sort((a, b) => b.peerScore - a.peerScore);
          const top3 = scored.slice(0, 3);
          setRelatedProducts(top3);
          setPeerBased(stage != null && top3.some((p) => p.peerScore > 0));
        }
      })
      .catch(() => {})
      .finally(() => setProductsLoading(false));
  }, [postId, title, route.params.content]);

  const handleLike = async () => {
    if (!uid || likeSubmitting) return;
    // Optimistic update
    const next = !isLiked;
    setIsLiked(next);
    setLikeCount((n) => n + (next ? 1 : -1));
    setLikeSubmitting(true);
    try {
      await toggleLikePost(postId, uid);
    } catch {
      // Roll back on error
      setIsLiked(!next);
      setLikeCount((n) => n + (next ? -1 : 1));
    } finally {
      setLikeSubmitting(false);
    }
  };

  const handleAddComment = async () => {
    const uid = auth.currentUser?.uid;
    const text = commentText.trim();
    if (!uid || !text) return;
    setSubmitting(true);
    try {
      await addComment({ postId, userId: uid, content: text, nickname: userNickname });
      incrementCommentCount(uid).catch(() => {});
      setCommentText('');
      const updated = await getComments(postId);
      setComments(updated);
    } catch (error) {
      console.log('PostDetailScreen addComment error:', error);
    } finally {
      setSubmitting(false);
    }
  };

  const trustCopy = peerBased
    ? '성장이 비슷한 또래 부모들이 80% 이상 선택했어요'
    : '비슷한 개월 수 부모님들이 많이 찾은 제품이에요';

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={88}
    >
      <FlatList
        data={comments}
        keyExtractor={(item) => item.commentId}
        renderItem={({ item }) => <CommentItem item={item} />}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View style={styles.postBlock}>
            {/* ── Category pill ── */}
            {/* ── Title ── */}
            <Text style={styles.postTitle}>{title}</Text>

            {/* ── Author row: avatar + name + [category pill · time · views] ── */}
            <TouchableOpacity
              style={styles.postAuthorRow}
              onPress={() =>
                route.params.userId &&
                navigation.navigate('UserProfile', { userId: route.params.userId })
              }
              activeOpacity={0.7}
            >
              {/* Avatar circle with first initial */}
              <View style={styles.postAvatar}>
                <Text style={styles.postAvatarChar}>
                  {(route.params.nickname || '익')[0]}
                </Text>
              </View>

              <View style={styles.postAuthorInfo}>
                {/* Name row: [tier] [badge] nickname */}
                <View style={styles.postAuthorNameRow}>
                  <GamPill item={postGam.tier} />
                  <GamPill item={postGam.badge} />
                  <Text style={styles.postAuthor}>{route.params.nickname || '익명'}</Text>
                  {route.params.isVerified ? (
                    <View style={styles.verifiedBadge}>
                      <Text style={styles.verifiedText}>구매 인증</Text>
                    </View>
                  ) : null}
                </View>

                {/* Meta row: category pill + time + views */}
                <View style={styles.postMetaRow}>
                  {category ? (() => {
                    const tc = TAG_COLORS[category] ?? { bg: '#f1f5f9', text: '#475569' };
                    return (
                      <View style={[styles.inlineCategoryBadge, { backgroundColor: tc.bg }]}>
                        <Text style={[styles.inlineCategoryText, { color: tc.text }]}>
                          {TAG_LABEL[category] || category}
                        </Text>
                      </View>
                    );
                  })() : null}
                  {category ? <Text style={styles.postMetaDot}>·</Text> : null}
                  {route.params.createdAt ? (
                    <Text style={styles.postMetaText}>
                      {formatPostTime(parseDate(route.params.createdAt))}
                    </Text>
                  ) : null}
                  {typeof route.params.viewCount === 'number' ? (
                    <>
                      <Text style={styles.postMetaDot}>·</Text>
                      <Text style={styles.postMetaText}>조회 {route.params.viewCount}</Text>
                    </>
                  ) : null}
                </View>
              </View>
            </TouchableOpacity>

            {/* ── Full-width divider below author area ── */}
            <View style={styles.sectionDivider} />

            {/* ── Content ── */}
            <Text style={styles.postContent}>{route.params.content || ''}</Text>

            {/* ── Attached images ── */}
            {imageUrls.length > 0 && (
              <View style={styles.imageList}>
                {imageUrls.map((uri, i) => (
                  <Image
                    key={uri + i}
                    source={{ uri }}
                    style={styles.postImage}
                    resizeMode="cover"
                  />
                ))}
              </View>
            )}

            {/* ── Like button — below content ── */}
            <TouchableOpacity
              style={[styles.likeButton, isLiked && styles.likeButtonActive]}
              onPress={handleLike}
              activeOpacity={0.8}
              disabled={likeSubmitting}
            >
              <Text style={[styles.likeButtonText, isLiked && styles.likeButtonTextActive]}>
                {isLiked ? '♥' : '♡'} {likeCount} 좋아요
              </Text>
            </TouchableOpacity>

            {/* ── Thick separator before recommendations ── */}
            <View style={styles.thickDivider} />

            {/* ── Related products: Context-to-Commerce carousel ── */}
            {(productsLoading || relatedProducts.length > 0) ? (
              <View style={showProminent ? styles.relatedBlockProminent : styles.relatedBlock}>
                <Text style={showProminent ? styles.relatedLabelProminent : styles.relatedLabel}>
                  🛒 이 글과 연관된 또래 추천 아이템
                </Text>
                {!productsLoading ? (
                  <Text style={styles.relatedNudge}>{trustCopy}</Text>
                ) : null}
                {productsLoading ? (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.relatedRow}
                    scrollEnabled={false}
                  >
                    {[0, 1, 2].map((i) => (
                      <View key={i} style={[styles.relatedCard, styles.relatedCardSkeleton]}>
                        <View style={[styles.relatedImage, styles.skeletonBlock]} />
                        <View style={[styles.skeletonLine, { width: '80%' }]} />
                        <View style={[styles.skeletonLine, { width: '50%' }]} />
                      </View>
                    ))}
                  </ScrollView>
                ) : (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.relatedRow}
                  >
                    {relatedProducts.map((item) => {
                      const pid = item.productId || item.productGroupId;
                      return (
                        <TouchableOpacity
                          key={pid}
                          style={styles.relatedCard}
                          activeOpacity={0.85}
                          onPress={() => {
                            recordProductAction({
                              userId: auth.currentUser?.uid,
                              productId: pid,
                              productGroupId: pid,
                              actionType: 'post_product_click',
                            });
                            navigation.navigate('ProductDetail', {
                              productId: pid,
                              productName: item.name || '상품',
                            });
                          }}
                        >
                          {item.image ? (
                            <Image
                              source={{ uri: item.image }}
                              style={styles.relatedImage}
                              resizeMode="cover"
                            />
                          ) : (
                            <View style={[styles.relatedImage, styles.relatedImageFallback]} />
                          )}
                          <Text style={styles.relatedName} numberOfLines={2}>
                            {item.name || ''}
                          </Text>
                          {typeof item.currentPrice === 'number' && item.currentPrice > 0 ? (
                            <Text style={styles.relatedPrice}>
                              ₩{item.currentPrice.toLocaleString('ko-KR')}
                            </Text>
                          ) : null}
                          {category === 'review' &&
                          typeof item.lastPriceDrop === 'number' &&
                          item.lastPriceDrop > 0 ? (
                            <View style={styles.relatedBestDealBadge}>
                              <Text style={styles.relatedBestDealText}>
                                💸 핫딜 ₩{item.lastPriceDrop.toLocaleString('ko-KR')} 하락
                              </Text>
                            </View>
                          ) : null}
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                )}
              </View>
            ) : null}

            {/* ── Comments header ── */}
            <View style={styles.sectionDivider} />
            <Text style={styles.commentsLabel}>💬 댓글 {comments.length}</Text>
            {loading ? <ActivityIndicator size="small" style={{ marginTop: 12 }} /> : null}
          </View>
        }
        ListEmptyComponent={
          !loading ? <Text style={styles.emptyComments}>첫 댓글을 남겨 보세요</Text> : null
        }
      />

      {/* Comment input */}
      <View style={styles.inputRow}>
        <TextInput
          ref={inputRef}
          style={styles.input}
          placeholder="댓글을 입력하세요"
          placeholderTextColor="#94a3b8"
          value={commentText}
          onChangeText={setCommentText}
          maxLength={300}
          returnKeyType="send"
          onSubmitEditing={handleAddComment}
        />
        <TouchableOpacity
          style={[styles.sendButton, !commentText.trim() && styles.sendButtonDisabled]}
          onPress={handleAddComment}
          disabled={submitting || !commentText.trim()}
          activeOpacity={0.85}
        >
          {submitting ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.sendButtonText}>등록</Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#f5f7fb' },
  listContent: { paddingBottom: 16 },
  postBlock: {
    backgroundColor: '#fff',
    borderBottomWidth: 6,
    borderBottomColor: '#f1f5f9',
    padding: 16,
    gap: 12,
  },
  postTitle: { fontSize: 22, fontWeight: '900', color: '#0f172a', lineHeight: 30 },
  postAuthorRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  postAvatar: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: '#dbeafe', alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  postAvatarChar: { fontSize: 16, fontWeight: '800', color: '#1d4ed8' },
  postAuthorInfo: { flex: 1, gap: 2 },
  postAuthorNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  postAuthor: { fontSize: 14, fontWeight: '800', color: '#0f172a' },
  verifiedBadge: {
    backgroundColor: '#dcfce7', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2,
  },
  verifiedText: { fontSize: 10, fontWeight: '700', color: '#16a34a' },
  postMetaRow:  { flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap' },
  postMetaDot:  { fontSize: 10, color: '#cbd5e1' },
  postMetaText: { fontSize: 12, color: '#94a3b8' },
  inlineCategoryBadge: {
    borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2,
  },
  inlineCategoryText: { fontSize: 10, fontWeight: '800' },
  postContent: { fontSize: 16, color: '#334155', lineHeight: 26, paddingVertical: 4 },

  // ─── Related products ─────────────────────────────────────────────────────
  relatedBlock: { gap: 8 },
  relatedBlockProminent: {
    gap: 8,
    backgroundColor: '#eff6ff',
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#bfdbfe',
    padding: 12,
  },
  relatedLabel: { fontSize: 14, fontWeight: '800', color: '#0f172a' },
  relatedLabelProminent: { fontSize: 14, fontWeight: '800', color: '#1d4ed8' },
  relatedNudge: { fontSize: 12, color: '#64748b', marginBottom: 4 },
  relatedRow: { gap: 10, paddingVertical: 4 },
  relatedCard: {
    width: 130,
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 8,
    gap: 6,
  },
  relatedImage: { width: '100%', height: 90, borderRadius: 6 },
  relatedImageFallback: { backgroundColor: '#e2e8f0' },
  relatedCardSkeleton: { opacity: 0.5 },
  skeletonBlock: { backgroundColor: '#e2e8f0', borderRadius: 6 },
  skeletonLine: { height: 10, backgroundColor: '#e2e8f0', borderRadius: 4, marginTop: 4 },
  relatedName: { fontSize: 12, fontWeight: '600', color: '#0f172a', lineHeight: 16 },
  relatedPrice: { fontSize: 12, fontWeight: '700', color: '#2563eb' },
  relatedBestDealBadge: {
    backgroundColor: '#fef3c7',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
    marginTop: 2,
  },
  relatedBestDealText: { fontSize: 10, fontWeight: '700', color: '#92400e' },

  // ─── Post images ───────────────────────────────────────────────────────────
  imageList: { gap: 8, marginTop: 4 },
  postImage: {
    width: '100%', aspectRatio: 4 / 3,
    borderRadius: 10, backgroundColor: '#e2e8f0',
  },

  // ─── Interactions ──────────────────────────────────────────────────────────
  likeButton: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: '#cbd5e1',
    gap: 4,
  },
  likeButtonActive:     { borderColor: '#f43f5e', backgroundColor: '#fff1f2' },
  likeButtonText:       { fontSize: 15, fontWeight: '800', color: '#94a3b8' },
  likeButtonTextActive: { color: '#f43f5e' },
  sectionDivider: { height: 1, backgroundColor: '#f1f5f9', marginHorizontal: -16 },
  thickDivider: { height: 6, backgroundColor: '#f1f5f9', marginHorizontal: -16 },
  sectionLabel: { fontSize: 13, fontWeight: '700', color: '#64748b' },
  commentsLabel: { fontSize: 15, fontWeight: '800', color: '#0f172a' },

  // ─── Comments ──────────────────────────────────────────────────────────────
  comment: {
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    gap: 8,
  },
  commentHeader:     { flexDirection: 'row', alignItems: 'center', gap: 10 },
  commentAvatar: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: '#e0e7ff', alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  commentAvatarChar: { fontSize: 13, fontWeight: '800', color: '#4f46e5' },
  commentAuthorInfo: { flex: 1, gap: 1 },
  commentAuthorRow:  { flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap' },
  commentAuthor:     { fontSize: 13, fontWeight: '700', color: '#0f172a' },
  commentDate:       { fontSize: 11, color: '#94a3b8' },
  badgePill:         { borderRadius: 5, paddingHorizontal: 5, paddingVertical: 2 },
  badgePillText:     { fontSize: 10, fontWeight: '800' },
  commentContent:    { fontSize: 14, color: '#334155', lineHeight: 20, paddingLeft: 42 },
  emptyComments: { textAlign: 'center', color: '#94a3b8', marginTop: 16, fontSize: 13 },

  // ─── Input row ─────────────────────────────────────────────────────────────
  inputRow: {
    flexDirection: 'row',
    padding: 10,
    gap: 8,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e4e7ed',
  },
  input: {
    flex: 1,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e4e7ed',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    color: '#0f172a',
  },
  sendButton: {
    backgroundColor: '#2563eb',
    borderRadius: 8,
    paddingHorizontal: 14,
    justifyContent: 'center',
  },
  sendButtonDisabled: { backgroundColor: '#cbd5e1' },
  sendButtonText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
