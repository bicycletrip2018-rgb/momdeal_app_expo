import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { collection, getDocs } from 'firebase/firestore';
import { useFocusEffect } from '@react-navigation/native';
import { db } from '../firebase/config';
import { searchCoupangProducts } from '../services/coupangApiService';

const formatPrice = (price) => {
  if (typeof price !== 'number') {
    return '-';
  }
  return `₩${price.toLocaleString('ko-KR')}`;
};

export default function ProductListScreen({ navigation }) {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [searchText, setSearchText] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);

  const fetchProducts = useCallback(async () => {
    try {
      setErrorMessage('');
      const snapshot = await getDocs(collection(db, 'products'));
      const mapped = snapshot.docs.map((docSnapshot) => ({
        id: docSnapshot.id,
        ...docSnapshot.data(),
      }));
      setProducts(mapped);
    } catch (error) {
      console.log('Failed to fetch products:', error);
      setErrorMessage('상품 목록을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  useFocusEffect(
    useCallback(() => {
      fetchProducts();
    }, [fetchProducts])
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchProducts();
  }, [fetchProducts]);

  const handleSearch = useCallback(async (text) => {
    const q = text.trim();
    if (!q) { setSearchResults([]); return; }
    setSearching(true);
    try {
      const results = await searchCoupangProducts(q, 20);
      setSearchResults(results);
    } catch (err) {
      console.log('ProductListScreen search error:', err);
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }, []);

  const renderItem = ({ item }) => (
    <TouchableOpacity
      style={styles.card}
      onPress={() =>
        navigation.navigate('ProductDetail', {
          productId: item.id,
          productName: item.name || '상품',
        })
      }
      activeOpacity={0.85}
    >
      <Text style={styles.name}>{item.name || '이름 없음'}</Text>
      <Text style={styles.meta}>현재가: {formatPrice(item.currentPrice)}</Text>
      <Text style={styles.meta}>브랜드: {item.brand || '-'}</Text>
      <Text style={styles.meta}>카테고리: {item.category || '-'}</Text>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
        <Text style={styles.helper}>상품 목록 불러오는 중...</Text>
      </View>
    );
  }

  const isSearchActive = searchText.trim().length > 0;
  const listData = isSearchActive ? searchResults : products;

  return (
    <View style={styles.container}>
      {/* Search bar — calls Coupang CF when submitted */}
      <View style={styles.searchRow}>
        <TextInput
          style={styles.searchInput}
          placeholder="쿠팡 상품 검색..."
          placeholderTextColor="#94a3b8"
          value={searchText}
          onChangeText={setSearchText}
          returnKeyType="search"
          onSubmitEditing={() => handleSearch(searchText)}
          clearButtonMode="while-editing"
        />
        {searching ? <ActivityIndicator size="small" style={{ marginLeft: 8 }} /> : null}
      </View>

      {!!errorMessage && !isSearchActive && <Text style={styles.error}>{errorMessage}</Text>}
      <FlatList
        data={listData}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        refreshControl={
          !isSearchActive
            ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
            : undefined
        }
        ListEmptyComponent={
          <Text style={styles.helper}>
            {isSearchActive ? '검색 결과가 없습니다.' : '등록된 상품이 없습니다.'}
          </Text>
        }
      />

      <TouchableOpacity
        style={styles.fab}
        onPress={() => navigation.navigate('ProductRegister')}
        activeOpacity={0.85}
      >
        <Text style={styles.fabText}>상품 추가</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f7fb',
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e4e7ed',
  },
  searchInput: {
    flex: 1,
    height: 38,
    backgroundColor: '#f1f5f9',
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 14,
    color: '#0f172a',
  },
  listContent: {
    padding: 12,
    gap: 10,
    paddingBottom: 88,
  },
  card: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e4e7ed',
    borderRadius: 10,
    padding: 12,
  },
  name: {
    color: '#0f172a',
    fontWeight: '800',
    fontSize: 16,
    marginBottom: 4,
  },
  meta: {
    color: '#334155',
    fontSize: 13,
    marginTop: 2,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  helper: {
    color: '#64748b',
  },
  error: {
    color: '#dc2626',
    paddingTop: 12,
    paddingHorizontal: 12,
  },
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 18,
    backgroundColor: '#2563eb',
    borderRadius: 24,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  fabText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
  },
});
