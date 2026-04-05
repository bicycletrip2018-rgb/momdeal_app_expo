import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { auth } from '../firebase/config';
import { getChildrenByUserId } from '../services/firestore/childrenRepository';

const formatAgeMonth = (child) => {
  if (child?.type === 'pregnancy') {
    return typeof child?.pregnancyWeek === 'number'
      ? `임신 ${child.pregnancyWeek}주`
      : '임신';
  }
  return typeof child?.ageMonth === 'number'
    ? `${child.ageMonth}개월`
    : '-';
};

export default function ChildListScreen({ navigation }) {
  const [children, setChildren] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const fetchChildren = useCallback(async () => {
    try {
      setErrorMessage('');
      const mapped = await getChildrenByUserId(auth.currentUser?.uid || '');
      mapped.sort((a, b) => {
        const aTime = a?.updatedAt?.toDate ? a.updatedAt.toDate().getTime() : 0;
        const bTime = b?.updatedAt?.toDate ? b.updatedAt.toDate().getTime() : 0;
        return bTime - aTime;
      });

      setChildren(mapped);
    } catch (error) {
      console.log('Failed to fetch children:', error);
      setErrorMessage('아이 목록을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchChildren();
  }, [fetchChildren]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchChildren();
  }, [fetchChildren]);

  const renderItem = ({ item }) => (
    <View style={styles.card}>
      <Text style={styles.name}>{item.name || '이름 없음'}</Text>
      <Text style={styles.meta}>유형: {item.type || '-'}</Text>
      <Text style={styles.meta}>
        {item.type === 'pregnancy' ? '임신 주차' : '개월수'}: {formatAgeMonth(item)}
      </Text>
      <Text style={styles.meta}>stage: {item.stage || '-'}</Text>
      {(typeof item.weight === 'number' || typeof item.height === 'number') && (
        <Text style={styles.meta}>
          신체: {typeof item.weight === 'number' ? `${item.weight}kg` : '-'} /{' '}
          {typeof item.height === 'number' ? `${item.height}cm` : '-'}
        </Text>
      )}
    </View>
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
        <Text style={styles.helper}>아이 목록 불러오는 중...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {!!errorMessage && <Text style={styles.error}>{errorMessage}</Text>}

      <View style={styles.headerRow}>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => navigation.navigate('ChildAdd')}
        >
          <Text style={styles.addButtonText}>아이 추가</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={children}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={
          <Text style={styles.helper}>등록된 아이가 없습니다.</Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f7fb',
  },
  listContent: {
    padding: 12,
    gap: 10,
    paddingTop: 0,
  },
  headerRow: {
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 8,
    alignItems: 'flex-end',
  },
  addButton: {
    backgroundColor: '#2563eb',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  addButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
  },
  card: {
    backgroundColor: '#fff',
    borderColor: '#e4e7ed',
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
  },
  name: {
    color: '#0f172a',
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 4,
  },
  meta: {
    color: '#334155',
    fontSize: 13,
    marginTop: 1,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  helper: {
    color: '#64748b',
  },
  error: {
    color: '#dc2626',
    paddingHorizontal: 12,
    paddingTop: 12,
  },
});