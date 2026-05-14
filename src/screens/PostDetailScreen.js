import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { User, ShoppingBag, MoreVertical, Heart } from 'lucide-react-native';
import { collection, deleteDoc, doc, getDocs, limit, query, where } from 'firebase/firestore';
import { auth, db } from '../firebase/config';
import { addComment, getComments, toggleLikePost } from '../services/communityService';
import { recordProductAction } from '../services/productActionService';
import { getOrCreateNickname, incrementCommentCount } from '../services/firestore/userRepository';
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

// Full timestamp for post detail header: YYYY.MM.DD. HH:mm
function formatDetailTime(date) {
  if (!date) return '';
  const yy = String(date.getFullYear());
  const mo = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const mi = String(date.getMinutes()).padStart(2, '0');
  return `${yy}.${mo}.${dd}. ${hh}:${mi}`;
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

// ─── Compact Tier Badge (mirrors CommunityListScreen) ────────────────────────

const TIER_BG = { 1: '#94A3B8', 2: '#10B981', 3: '#F59E0B', 4: '#2E6FF2' };

function getMockTierLevel(seed) {
  if (!seed) return 1;
  const n = String(seed).split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  return (n % 4) + 1;
}

function TierBadge({ seed }) {
  const level = getMockTierLevel(seed);
  return (
    <View style={[styles.tierBadge, { backgroundColor: TIER_BG[level] }]}>
      <Text style={styles.tierBadgeText}>{level}</Text>
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

  return (
    <View style={styles.comment}>
      {/* Author row */}
      <View style={styles.commentHeader}>
        <View style={styles.commentAvatarCircle}>
          <User size={20} color="#94A3B8" />
        </View>
        <View style={styles.commentAuthorInfo}>
          <View style={styles.commentAuthorRow}>
            <Text style={styles.commentAuthor}>{item.nickname || '익명'}</Text>
            <TierBadge seed={item.userId || item.nickname} />
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
  const [showOwnerMenu,   setShowOwnerMenu]     = useState(false);
  const [isMockAuthor,    setIsMockAuthor]      = useState(true);
  const inputRef = useRef(null);

  const isOwner = (uid && route.params.userId === uid) || isMockAuthor;

  const handleDelete = async () => {
    try {
      await deleteDoc(doc(db, 'posts', postId));
      setShowOwnerMenu(false);
      navigation.goBack();
    } catch (err) {
      console.log('PostDetailScreen handleDelete error:', err);
    }
  };

  useLayoutEffect(() => {
    navigation.setOptions({ title: '' });
    navigation.getParent()?.setOptions({ tabBarStyle: { display: 'none' } });
    return () => navigation.getParent()?.setOptions({ tabBarStyle: undefined });
  }, [navigation]);

  const [androidKbOffset, setAndroidKbOffset] = useState(0);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const show = Keyboard.addListener('keyboardDidShow', (e) => {
      setAndroidKbOffset(e.endCoordinates.height);
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => {
      setAndroidKbOffset(0);
    });
    return () => { show.remove(); hide.remove(); };
  }, []);

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

  const postDate    = parseDate(route.params.createdAt);
  const postDateStr = postDate ? formatDetailTime(postDate) : '';

  return (
    <SafeAreaView edges={['bottom']} style={[styles.safeArea, Platform.OS === 'android' && androidKbOffset > 0 && { paddingBottom: androidKbOffset }]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* ── Post block ── */}
          <View style={styles.postBlock}>
            {/* Header zone: Breadcrumb → Title → Author */}
            <View style={styles.postHeader}>
              <Text style={styles.postBreadcrumb}>
                {TAG_LABEL[category] || category} {'>'}
              </Text>
              <Text style={styles.postTitle}>{title}</Text>
              <View style={styles.postAuthorContainer}>
                <TouchableOpacity
                  style={[styles.postAuthorRow, { flex: 1 }]}
                  onPress={() =>
                    route.params.userId &&
                    navigation.navigate('UserProfile', { userId: route.params.userId })
                  }
                  activeOpacity={0.7}
                >
                  <View style={styles.postAvatarCircle}>
                    <User size={22} color="#94A3B8" />
                  </View>
                  <View style={styles.postAuthorInfo}>
                    <View style={styles.postAuthorNameRow}>
                      <Text style={styles.postAuthor}>{route.params.nickname || '익명'}</Text>
                      <TierBadge seed={route.params.userId || route.params.nickname} />
                      {route.params.isVerified ? (
                        <View style={styles.verifiedBadge}>
                          <Text style={styles.verifiedText}>구매 인증</Text>
                        </View>
                      ) : null}
                    </View>
                    <Text style={styles.postMetaText}>
                      {postDateStr}{postDateStr ? '  ·  ' : ''}조회 {route.params.viewCount ?? 0}
                    </Text>
                  </View>
                </TouchableOpacity>
                {isOwner && (
                  <TouchableOpacity
                    onPress={() => setShowOwnerMenu(true)}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <MoreVertical size={20} color="#64748B" />
                  </TouchableOpacity>
                )}
              </View>
            </View>

            <View style={styles.sectionDivider} />
            <Text style={styles.postContent}>{route.params.content || ''}</Text>

            {imageUrls.length > 0 && (
              <View style={styles.imageList}>
                {imageUrls.map((uri, i) => (
                  <Image key={uri + i} source={{ uri }} style={styles.postImage} resizeMode="cover" />
                ))}
              </View>
            )}

            <TouchableOpacity
              style={[styles.likeButton, isLiked && styles.likeButtonActive]}
              onPress={handleLike}
              activeOpacity={0.8}
              disabled={likeSubmitting}
            >
              {isLiked
                ? <Heart size={18} color="#EF4444" fill="#EF4444" />
                : <Heart size={18} color="#64748B" />}
              <Text style={[styles.likeButtonText, isLiked && styles.likeButtonTextActive]}>
                {likeCount} 좋아요
              </Text>
            </TouchableOpacity>

            <View style={styles.thickDivider} />

            {(productsLoading || relatedProducts.length > 0) ? (
              <View style={styles.relatedBlock}>
                <View style={styles.relatedLabelRow}>
                  <ShoppingBag size={18} color="#2E6FF2" />
                  <Text style={styles.relatedLabel}>이 글과 연관된 맞춤 추천</Text>
                </View>
                {!productsLoading ? (
                  <Text style={styles.relatedNudge}>비슷한 개월 수 부모님들이 많이 찾은 제품이에요</Text>
                ) : null}
                {productsLoading ? (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.relatedRow} scrollEnabled={false}>
                    {[0, 1, 2].map((i) => (
                      <View key={i} style={[styles.relatedCard, styles.relatedCardSkeleton]}>
                        <View style={[styles.relatedImage, styles.skeletonBlock]} />
                        <View style={[styles.skeletonLine, { width: '80%' }]} />
                        <View style={[styles.skeletonLine, { width: '50%' }]} />
                      </View>
                    ))}
                  </ScrollView>
                ) : (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.relatedRow}>
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
                            navigation.navigate('ProductDetail', { productId: pid, productName: item.name || '상품' });
                          }}
                        >
                          {item.image ? (
                            <Image source={{ uri: item.image }} style={styles.relatedImage} resizeMode="cover" />
                          ) : (
                            <View style={[styles.relatedImage, styles.relatedImageFallback]} />
                          )}
                          <Text style={styles.relatedName} numberOfLines={2}>{item.name || ''}</Text>
                          {typeof item.currentPrice === 'number' && item.currentPrice > 0 ? (
                            <Text style={styles.relatedPrice}>₩{item.currentPrice.toLocaleString('ko-KR')}</Text>
                          ) : null}
                          {category === 'review' && typeof item.lastPriceDrop === 'number' && item.lastPriceDrop > 0 ? (
                            <View style={styles.relatedBestDealBadge}>
                              <Text style={styles.relatedBestDealText}>핫딜 ₩{item.lastPriceDrop.toLocaleString('ko-KR')} 하락</Text>
                            </View>
                          ) : null}
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                )}
              </View>
            ) : null}

            <View style={styles.sectionDivider} />
            <Text style={styles.commentsLabel}>댓글 {comments.length}</Text>
          </View>

          {/* ── Comment items ── */}
          {loading ? <ActivityIndicator size="small" style={{ marginTop: 12 }} /> : null}
          {comments.map((item) => <CommentItem key={item.commentId} item={item} />)}
          {!loading && comments.length === 0 ? (
            <Text style={styles.emptyComments}>첫 댓글을 남겨 보세요</Text>
          ) : null}

          <TouchableOpacity
            onPress={() => setIsMockAuthor(!isMockAuthor)}
            style={{ padding: 8, backgroundColor: '#333', alignSelf: 'center', marginBottom: 20, borderRadius: 8 }}
          >
            <Text style={{ color: '#FFF', fontSize: 12 }}>[QA Test] Toggle Ownership: {isMockAuthor ? 'ON' : 'OFF'}</Text>
          </TouchableOpacity>
        </ScrollView>

        {/* Comment input — outside ScrollView, inside KAV */}
        <View style={{ flexDirection: 'row', padding: 12, gap: 8, borderTopWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#FFF' }}>
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

      {/* Owner action sheet */}
      <Modal visible={showOwnerMenu} transparent animationType="slide" onRequestClose={() => setShowOwnerMenu(false)}>
        <View style={styles.menuOverlay}>
          <Pressable style={{ flex: 1 }} onPress={() => setShowOwnerMenu(false)} />
          <View style={styles.menuSheet}>
            <View style={styles.menuHandle} />
            <TouchableOpacity
              style={styles.menuItem}
              activeOpacity={0.7}
              onPress={() => {
                setShowOwnerMenu(false);
                navigation.navigate('WritePost', {
                  editMode: true,
                  postData: {
                    postId,
                    title,
                    content: route.params.content,
                    category,
                    imageUrls: route.params.imageUrls ?? [],
                  },
                });
              }}
            >
              <Text style={styles.menuItemText}>수정하기</Text>
            </TouchableOpacity>
            <View style={styles.menuDivider} />
            <TouchableOpacity style={styles.menuItem} activeOpacity={0.7} onPress={handleDelete}>
              <Text style={[styles.menuItemText, { color: '#EF4444' }]}>삭제하기</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea:     { flex: 1, backgroundColor: '#fff' },
  flex:         { flex: 1, backgroundColor: '#f5f7fb' },
  scrollContent: { flexGrow: 1, paddingTop: 0, paddingBottom: 16 },
  postBlock: {
    backgroundColor: '#fff',
    borderBottomWidth: 6,
    borderBottomColor: '#f1f5f9',
    paddingTop: 0, paddingHorizontal: 16, paddingBottom: 16,
    gap: 12,
  },
  postHeader:   { gap: 0, marginTop: 0, paddingTop: 12 },
  postBreadcrumb: { fontSize: 13, fontWeight: '600', color: '#10B981', marginTop: 0, marginBottom: 8 },
  postTitle:    { fontSize: 20, fontWeight: '700', color: '#0F172A', lineHeight: 28, marginBottom: 4 },
  postAuthorContainer: { flexDirection: 'row', alignItems: 'center' },
  postAuthorRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  postAvatarCircle: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#F8FAFC',
    borderWidth: 1, borderColor: '#F1F5F9',
    justifyContent: 'center', alignItems: 'center',
    flexShrink: 0,
  },
  postAuthorInfo: { flex: 1, gap: 2 },
  postAuthorNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  postAuthor: { fontSize: 14, fontWeight: '700', color: '#0f172a' },
  tierBadge:     { width: 15, height: 15, borderRadius: 4, justifyContent: 'center', alignItems: 'center' },
  tierBadgeText: { fontSize: 9, fontWeight: 'bold', color: '#FFFFFF', lineHeight: 13 },
  verifiedBadge: {
    backgroundColor: '#dcfce7', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2,
  },
  verifiedText: { fontSize: 10, fontWeight: '700', color: '#16a34a' },
  postMetaText: { fontSize: 12, color: '#94a3b8', marginTop: 4 },
  postContent: { fontSize: 16, color: '#334155', lineHeight: 26, paddingVertical: 4 },

  // ─── Related products ─────────────────────────────────────────────────────
  relatedBlock: {
    gap: 8,
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 12,
  },
  relatedLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  relatedLabel: { fontSize: 14, fontWeight: '800', color: '#0f172a' },
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
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFF',
    gap: 6,
    marginVertical: 24,
  },
  likeButtonActive:     { backgroundColor: '#FEF2F2', borderColor: '#FECACA' },
  likeButtonText:       { fontSize: 14, fontWeight: '600', color: '#64748B' },
  likeButtonTextActive: { color: '#EF4444' },
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
  commentHeader:    { flexDirection: 'row', alignItems: 'center', gap: 10 },
  commentAvatarCircle: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#F8FAFC',
    borderWidth: 1, borderColor: '#F1F5F9',
    justifyContent: 'center', alignItems: 'center',
    flexShrink: 0,
  },
  commentAuthorInfo: { flex: 1, gap: 1 },
  commentAuthorRow:  { flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap' },
  commentAuthor:     { fontSize: 13, fontWeight: '700', color: '#0f172a' },
  commentDate:       { fontSize: 11, color: '#94a3b8' },
  commentContent:    { fontSize: 14, color: '#334155', lineHeight: 20, paddingLeft: 46 },
  emptyComments: { textAlign: 'center', color: '#94a3b8', marginTop: 16, fontSize: 13 },

  // ─── Input row ─────────────────────────────────────────────────────────────
  inputRow: {
    flexDirection: 'row',
    padding: 12,
    gap: 8,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
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

  // ─── Owner action sheet ────────────────────────────────────────────────────
  menuOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  menuSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingHorizontal: 20, paddingBottom: 40, paddingTop: 12,
    ...Platform.select({
      ios:     { shadowColor: '#000', shadowOffset: { width: 0, height: -2 }, shadowOpacity: 0.1, shadowRadius: 8 },
      android: { elevation: 10 },
    }),
  },
  menuHandle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: '#e2e8f0', alignSelf: 'center', marginBottom: 16,
  },
  menuItem: { paddingVertical: 16 },
  menuItemText: { fontSize: 16, fontWeight: '600', color: '#0f172a' },
  menuDivider: { height: StyleSheet.hairlineWidth, backgroundColor: '#f1f5f9' },
});
