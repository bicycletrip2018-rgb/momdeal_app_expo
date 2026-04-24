import React, { useEffect, useState } from 'react';
import { DeepLinkProvider } from './src/contexts/DeepLinkContext';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import Tab1_ProductList from './src/screens/Tab1_ProductList';
import HomeScreen from './src/screens/HomeScreen';
import ProductDetail from './src/screens/ProductDetail';
import ProductRegister from './src/screens/ProductRegister';
import ProductListScreen from './src/screens/ProductListScreen';
import RankingScreen from './src/screens/RankingScreen';
import CategoryDetailScreen from './src/screens/CategoryDetailScreen';

import ChildListScreen from './src/screens/ChildListScreen';
import ChildAddScreen from './src/screens/ChildAddScreen';
import ReviewWriteScreen from './src/screens/ReviewWriteScreen';
import SavedProductsScreen from './src/screens/SavedProductsScreen';
import CommunityFeedScreen from './src/screens/CommunityFeedScreen';
import MyPageScreen from './src/screens/MyPageScreen';
import BenefitsScreen from './src/screens/BenefitsScreen';
import CommunityListScreen from './src/screens/CommunityListScreen';
import PostDetailScreen from './src/screens/PostDetailScreen';
import WritePostScreen from './src/screens/WritePostScreen';
import UserProfileScreen from './src/screens/UserProfileScreen';
import NotificationScreen from './src/screens/NotificationScreen';
import AdminDashboardScreen from './src/screens/AdminDashboardScreen';
import SearchScreen from './src/screens/SearchScreen';
import SearchResultScreen from './src/screens/SearchResultScreen';
import RewardClaimScreen from './src/screens/RewardClaimScreen';
import TrackingListScreen from './src/screens/TrackingListScreen';
import CurationDetailScreen from './src/screens/CurationDetailScreen';
import DetailScreen from './src/screens/DetailScreen';
import CategoryScreen from './src/screens/CategoryScreen';
import OnboardingScreen from './src/screens/OnboardingScreen';
import InitialOnboardingScreen from './src/screens/InitialOnboardingScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import LevelInfoScreen from './src/screens/LevelInfoScreen';
import NotificationSettingsScreen from './src/screens/NotificationSettingsScreen';
import TrialGuideScreen from './src/screens/TrialGuideScreen';
import ProfileSettingsScreen from './src/screens/ProfileSettingsScreen';
import UserActivityScreen from './src/screens/UserActivityScreen';
import MyActivityScreen from './src/screens/MyActivityScreen';
import RecentlyViewedScreen from './src/screens/RecentlyViewedScreen';
import useAuthSync from './src/hooks/useAuthSync';
import { COLORS } from './src/constants/theme';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from './src/firebase/config';
import { getChildrenByUserId } from './src/services/firestore/childrenRepository';
import { TrackingProvider } from './src/context/TrackingContext';
import { NotificationProvider } from './src/context/NotificationContext';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();
const RootStack = createNativeStackNavigator();

function PriceStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen
        name="PriceList"
        component={HomeScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="Detail"
        component={DetailScreen}
        options={({ route }) => ({ title: route.params?.item?.name || '상품 상세' })}
      />
      <Stack.Screen
        name="Search"
        component={SearchScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="SearchResult"
        component={SearchResultScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="Notifications"
        component={NotificationScreen}
        options={{ title: '알림' }}
      />
      <Stack.Screen
        name="NotificationSettings"
        component={NotificationSettingsScreen}
        options={{ title: '알림 설정', headerBackTitleVisible: false }}
      />
      <Stack.Screen
        name="PostDetail"
        component={PostDetailScreen}
        options={({ route }) => ({ title: route.params?.title || '게시글' })}
      />
      <Stack.Screen
        name="ReviewWrite"
        component={ReviewWriteScreen}
        options={{ title: '리뷰 작성' }}
      />
      <Stack.Screen
        name="Category"
        component={CategoryScreen}
        options={{ title: '기저귀·분유' }}
      />
      <Stack.Screen
        name="ProductDetail"
        component={ProductDetail}
        options={{ title: '상품 상세' }}
      />
      <Stack.Screen
        name="TrialGuide"
        component={TrialGuideScreen}
        options={{ title: '무료 체험단 가이드', headerBackTitleVisible: false }}
      />
      <Stack.Screen
        name="ProfileSettings"
        component={ProfileSettingsScreen}
        options={{ title: '맞춤 정보 설정' }}
      />
    </Stack.Navigator>
  );
}

function ChildStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen
        name="ChildList"
        component={ChildListScreen}
        options={{ title: '아이' }}
      />
      <Stack.Screen
        name="ChildAdd"
        component={ChildAddScreen}
        options={{ headerShown: false }}
      />
    </Stack.Navigator>
  );
}

function ProductStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen
        name="ProductList"
        component={RankingScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="ProductRegister"
        component={ProductRegister}
        options={{ title: '상품 등록' }}
      />
      <Stack.Screen
        name="Detail"
        component={DetailScreen}
        options={({ route }) => ({ title: route.params?.item?.name || '상품 상세' })}
      />
      <Stack.Screen
        name="CategoryDetail"
        component={CategoryDetailScreen}
        options={({ route }) => ({ title: route.params?.categoryName || '카테고리' })}
      />
      <Stack.Screen
        name="ReviewWrite"
        component={ReviewWriteScreen}
        options={{ title: '리뷰 작성' }}
      />
    </Stack.Navigator>
  );
}

function CommunityStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen
        name="CommunityList"
        component={CommunityListScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="CommunityFeed"
        component={CommunityFeedScreen}
        options={{ title: '리뷰 피드' }}
      />
      <Stack.Screen
        name="PostDetail"
        component={PostDetailScreen}
        options={({ route }) => ({ title: route.params?.title || '게시글' })}
      />
      <Stack.Screen
        name="WritePost"
        component={WritePostScreen}
        options={{ title: '글쓰기' }}
      />
      <Stack.Screen
        name="UserProfile"
        component={UserProfileScreen}
        options={{ title: '사용자 프로필' }}
      />
      <Stack.Screen
        name="Detail"
        component={DetailScreen}
        options={({ route }) => ({ title: route.params?.item?.name || '상품 상세' })}
      />
      <Stack.Screen
        name="ReviewWrite"
        component={ReviewWriteScreen}
        options={{ title: '리뷰 작성' }}
      />
    </Stack.Navigator>
  );
}

function SavedStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen
        name="SavedList"
        component={SavedProductsScreen}
        options={{ title: '저장한 상품' }}
      />
      <Stack.Screen
        name="Detail"
        component={DetailScreen}
        options={({ route }) => ({ title: route.params?.item?.name || '상품 상세' })}
      />
      <Stack.Screen
        name="ReviewWrite"
        component={ReviewWriteScreen}
        options={{ title: '리뷰 작성' }}
      />
    </Stack.Navigator>
  );
}

function MyPageStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen
        name="MyPage"
        component={MyPageScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="ChildAdd"
        component={ChildAddScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="Detail"
        component={DetailScreen}
        options={({ route }) => ({ title: route.params?.item?.name || '상품 상세' })}
      />
      <Stack.Screen
        name="ReviewWrite"
        component={ReviewWriteScreen}
        options={{ title: '리뷰 작성' }}
      />
      <Stack.Screen
        name="Notifications"
        component={NotificationScreen}
        options={{ title: '알림' }}
      />
      {/* Admin-only — access gated in MyPageScreen by role check */}
      <Stack.Screen
        name="AdminDashboard"
        component={AdminDashboardScreen}
        options={{ title: '어드민 대시보드' }}
      />
      <Stack.Screen
        name="RewardClaim"
        component={RewardClaimScreen}
        options={{ title: '포인트 적립 신청' }}
      />
      <Stack.Screen
        name="InitialOnboarding"
        component={InitialOnboardingScreen}
        options={{ title: '온보딩 체험', headerBackTitleVisible: false }}
      />
      <Stack.Screen
        name="Settings"
        component={SettingsScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="LevelInfo"
        component={LevelInfoScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="NotificationSettings"
        component={NotificationSettingsScreen}
        options={{ title: '알림 설정', headerBackTitleVisible: false }}
      />
      <Stack.Screen
        name="UserActivity"
        component={UserActivityScreen}
        options={{ title: '내 활동', headerBackTitleVisible: false }}
      />
      <Stack.Screen
        name="MyActivity"
        component={MyActivityScreen}
        options={{
          title: '내 활동',
          headerBackTitleVisible: false,
          headerTitleAlign: 'center',
          headerTitleStyle: { fontSize: 18, fontWeight: '700', color: '#0f172a' },
        }}
      />
      <Stack.Screen
        name="RecentlyViewed"
        component={RecentlyViewedScreen}
        options={{
          title: '최근 본 상품',
          headerBackTitleVisible: false,
          headerTitleAlign: 'center',
          headerTitleStyle: { fontSize: 18, fontWeight: '700', color: '#0f172a' },
        }}
      />
    </Stack.Navigator>
  );
}

function TrackingTab() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: true }}>
      <Stack.Screen
        name="TrackingListMain"
        component={TrackingListScreen}
        options={{ title: '관심상품', headerLargeTitle: false }}
      />
      <Stack.Screen
        name="CurationDetail"
        component={CurationDetailScreen}
        options={({ route }) => ({ title: route.params?.title || '모아보기' })}
      />
      <Stack.Screen
        name="Detail"
        component={DetailScreen}
        options={({ route }) => ({ title: route.params?.item?.name || '가격 분석' })}
      />
    </Stack.Navigator>
  );
}

const ACTIVE_COLOR   = COLORS.primary;
const INACTIVE_COLOR = COLORS.textSub;

function icon(active, inactive) {
  return ({ focused, size }) => (
    <Ionicons
      name={focused ? active : inactive}
      size={size ?? 24}
      color={focused ? ACTIVE_COLOR : INACTIVE_COLOR}
    />
  );
}

function MainTabs() {
  return (
    <Tab.Navigator
      initialRouteName="홈"
      backBehavior="history"
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor:   ACTIVE_COLOR,
        tabBarInactiveTintColor: INACTIVE_COLOR,
        tabBarStyle: { backgroundColor: COLORS.white },
      }}
    >
      <Tab.Screen name="홈"      component={PriceStack}     options={{ tabBarIcon: icon('home',         'home-outline') }} />
      <Tab.Screen name="랭킹"    component={ProductStack}   options={{ tabBarIcon: icon('trophy',       'trophy-outline') }} />
      <Tab.Screen name="커뮤니티" component={CommunityStack} options={{ tabBarIcon: icon('chatbubbles',  'chatbubbles-outline') }} />
      <Tab.Screen name="관심상품" component={TrackingTab}    options={{ tabBarIcon: icon('heart',        'heart-outline') }} />
      <Tab.Screen name="마이페이지" component={MyPageStack}    options={{ tabBarIcon: icon('person',       'person-outline') }} />
    </Tab.Navigator>
  );
}

export default function App() {
  useAuthSync();

  // null = still checking, false = show onboarding, true = go straight to main
  const [onboardingDone, setOnboardingDone] = useState(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        // No user yet (anonymous sign-in pending) — keep waiting
        return;
      }
      try {
        const children = await getChildrenByUserId(user.uid);
        setOnboardingDone(children.length > 0);
      } catch {
        // Fail-safe: skip onboarding on error so the app is never blocked
        setOnboardingDone(true);
      }
    });
    return unsub;
  }, []);

  // Splash while auth + children check resolves
  if (onboardingDone === null) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' }}>
        <ActivityIndicator size="large" color="#f472b6" />
      </View>
    );
  }

  return (
    <DeepLinkProvider>
    <SafeAreaProvider>
    <TrackingProvider>
    <NotificationProvider>
    <View style={{ flex: 1 }}>
      <NavigationContainer>
        {!onboardingDone ? (
          // First-time user: show onboarding; completion/skip switches to MainTabs
          <RootStack.Navigator screenOptions={{ headerShown: false }}>
            <RootStack.Screen name="Onboarding">
              {(props) => (
                <OnboardingScreen
                  {...props}
                  onComplete={() => setOnboardingDone(true)}
                  onSkip={() => setOnboardingDone(true)}
                />
              )}
            </RootStack.Screen>
          </RootStack.Navigator>
        ) : (
          <MainTabs />
        )}
      </NavigationContainer>
    </View>
    </NotificationProvider>
    </TrackingProvider>
    </SafeAreaProvider>
    </DeepLinkProvider>
  );
}