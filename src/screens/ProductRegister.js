import React from 'react';
import {
  Alert,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { registerCoupangProduct } from '../utils/registerCoupangProduct';

export default function ProductRegister() {

  const [url, setUrl] = React.useState('');

  const handleRegister = async () => {

    console.log("REGISTER BUTTON CLICKED");
    console.log("URL:", url);

    if (!url) {
      Alert.alert("URL을 입력하세요");
      return;
    }

    try {

      const result = await registerCoupangProduct(url);

      console.log("REGISTER RESULT:", result);

      if (!result.ok) {

        console.log("REGISTER FAILED");

        Alert.alert('상품 등록 실패');
        return;
      }

      console.log("REGISTER SUCCESS");

      Alert.alert('상품 등록 완료');

      setUrl('');

    } catch (error) {

      console.log('REGISTER ERROR:', error);

      Alert.alert('상품 등록 실패');
    }
  };

  return (
    <View style={styles.container}>

      <Text style={styles.text}>상품 등록 화면</Text>

      <TextInput
        style={styles.input}
        value={url}
        onChangeText={setUrl}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder="쿠팡 상품 URL 입력"
      />

      <TouchableOpacity
        style={styles.button}
        onPress={handleRegister}
        activeOpacity={0.85}
      >
        <Text style={styles.buttonText}>상품 등록</Text>
      </TouchableOpacity>

    </View>
  );
}

const styles = StyleSheet.create({

  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },

  text: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
  },

  input: {
    width: '100%',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#dbe1ea',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
  },

  button: {
    backgroundColor: '#2563eb',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },

  buttonText: {
    color: '#fff',
    fontWeight: '700',
  },

});