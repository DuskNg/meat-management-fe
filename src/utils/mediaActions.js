import { Audio } from 'expo-av';
// readAsStringAsync/EncodingType thuộc legacy API trong Expo SDK 56.
// Dùng subpath này để tránh Metro resolve nhầm entrypoint mới của package.
import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';

export async function captureTicketImage() {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) {
    throw new Error('CAMERA_PERMISSION_DENIED');
  }

  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsEditing: true,
    quality: 0.8,
    base64: true,
  });

  if (result.canceled || !result.assets?.[0]?.base64) return null;

  const asset = result.assets[0];
  return {
    dataUri: `data:${asset.mimeType || 'image/jpeg'};base64,${asset.base64}`,
  };
}

export async function selectTicketImages() {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsMultipleSelection: true,
    quality: 0.8,
    base64: true,
  });

  if (result.canceled) return [];

  return result.assets
    .filter((asset) => asset.base64)
    .map((asset) => ({
      dataUri: `data:${asset.mimeType || 'image/jpeg'};base64,${asset.base64}`,
    }));
}

export async function startNativeRecording() {
  const permission = await Audio.requestPermissionsAsync();
  if (!permission.granted) {
    throw new Error('MIC_PERMISSION_DENIED');
  }

  await Audio.setAudioModeAsync({
    allowsRecordingIOS: true,
    playsInSilentModeIOS: true,
  });

  const { recording } = await Audio.Recording.createAsync(
    Audio.RecordingOptionsPresets.HIGH_QUALITY
  );
  return recording;
}

export async function stopNativeRecording(recording) {
  await recording.stopAndUnloadAsync();
  await Audio.setAudioModeAsync({
    allowsRecordingIOS: false,
    playsInSilentModeIOS: true,
  });

  const uri = recording.getURI();
  if (!uri) throw new Error('RECORDING_FILE_NOT_FOUND');

  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  return {
    dataUri: `data:audio/mp4;base64,${base64}`,
    mimeType: 'audio/mp4',
  };
}
