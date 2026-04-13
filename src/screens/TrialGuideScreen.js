import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView, ScrollView, Image } from 'react-native';
import { useNavigation } from '@react-navigation/native';

const TrialGuideScreen = () => {
  const navigation = useNavigation();

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} bounces={false}>
        {/* When image is ready, replace this View with:
            <Image source={require('path')} style={styles.fullImage} resizeMode="contain" /> */}
        <View style={styles.imagePlaceholder}>
          <Text style={styles.placeholderText}>
            가로 1080px 기준, 세로는 무한대로 긴 이미지를 넣을 수 있습니다. 스크롤 가능합니다.
          </Text>
        </View>
      </ScrollView>
      <View style={styles.bottomContainer}>
        <TouchableOpacity style={styles.ctaButton} onPress={() => navigation.navigate('커뮤니티')}>
          <Text style={styles.ctaText}>커뮤니티로 가기</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container:          { flex: 1, backgroundColor: '#fff' },
  scrollContent:      { flexGrow: 1 },
  imagePlaceholder:   { flex: 1, minHeight: 800, backgroundColor: '#f1f5f9', justifyContent: 'center', alignItems: 'center', margin: 16 },
  fullImage:          { width: '100%', height: undefined, aspectRatio: 0.5 },
  placeholderText:    { color: '#64748b', fontSize: 16, textAlign: 'center', padding: 20 },
  bottomContainer:    { padding: 16, paddingBottom: 32, backgroundColor: '#fff', borderTopWidth: 1, borderColor: '#f1f5f9' },
  ctaButton:          { backgroundColor: '#3b82f6', paddingVertical: 16, borderRadius: 12, alignItems: 'center' },
  ctaText:            { color: '#fff', fontSize: 16, fontWeight: 'bold' },
});

export default TrialGuideScreen;
