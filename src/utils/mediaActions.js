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

  if (result.canceled || !result.assets?.[0]) return null;

  const asset = result.assets[0];
  let base64Data = asset.base64;
  if (!base64Data) {
    try {
      base64Data = await FileSystem.readAsStringAsync(asset.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
    } catch (fileErr) {
      console.error('Không thể đọc file ảnh chụp:', fileErr);
    }
  }

  return {
    dataUri: base64Data ? `data:${asset.mimeType || 'image/jpeg'};base64,${base64Data}` : null,
  };
}

export async function selectTicketImages() {
  // Yêu cầu quyền truy cập thư viện ảnh trên thiết bị
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new Error('MEDIA_LIBRARY_PERMISSION_DENIED');
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsMultipleSelection: true,
    quality: 0.8,
    base64: true,
  });

  if (result.canceled || !result.assets) return [];

  // Đọc file ảnh dưới dạng Base64 bằng FileSystem nếu ImagePicker không trả về base64
  const images = await Promise.all(
    result.assets.map(async (asset) => {
      let base64Data = asset.base64;
      if (!base64Data) {
        try {
          base64Data = await FileSystem.readAsStringAsync(asset.uri, {
            encoding: FileSystem.EncodingType.Base64,
          });
        } catch (fileErr) {
          console.error('Không thể đọc file ảnh:', fileErr);
        }
      }
      return {
        dataUri: base64Data ? `data:${asset.mimeType || 'image/jpeg'};base64,${base64Data}` : null,
      };
    })
  );

  return images.filter((img) => img.dataUri);
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


