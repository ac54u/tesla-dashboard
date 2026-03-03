import * as Location from 'expo-location';
import * as WebBrowser from 'expo-web-browser'; // 【新增】用于唤起登录网页
import React, { useEffect, useRef, useState } from 'react';
import { Platform, StatusBar, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE, Region } from 'react-native-maps';
import Animated, { useAnimatedProps, useSharedValue, withSpring } from 'react-native-reanimated';
import Svg, { Circle, Path } from 'react-native-svg';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const customMapStyle = [
  { "elementType": "geometry", "stylers": [ { "color": "#212121" } ] },
  { "elementType": "labels.icon", "stylers": [ { "visibility": "off" } ] },
  { "elementType": "labels.text.fill", "stylers": [ { "color": "#757575" } ] },
  { "elementType": "labels.text.stroke", "stylers": [ { "color": "#212121" } ] },
  { "featureType": "administrative", "elementType": "geometry", "stylers": [ { "color": "#757575" } ] },
  { "featureType": "administrative.country", "elementType": "labels.text.fill", "stylers": [ { "color": "#9e9e9e" } ] },
  { "featureType": "road", "elementType": "geometry.fill", "stylers": [ { "color": "#2c2c2c" } ] },
  { "featureType": "water", "elementType": "geometry", "stylers": [ { "color": "#000000" } ] }
];

export default function App() {
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;

  const [speed, setSpeed] = useState<number>(0);
  const [gear, setGear] = useState<string>('P');
  const [battery, setBattery] = useState<number>(0);
  const [range, setRange] = useState<number>(0);
  const [heading, setHeading] = useState<number>(0);
  
  // 【新增】判断是否需要登录
  const [needsLogin, setNeedsLogin] = useState<boolean>(false); 
  
  const [mapRegion, setMapRegion] = useState<Region>({
    latitude: 39.9042, 
    longitude: 116.4074,
    latitudeDelta: 0.01, 
    longitudeDelta: 0.01,
  });

  const currentDeltas = useRef({ latitudeDelta: 0.01, longitudeDelta: 0.01 });
  const dateString = "2026年3月3日 星期二 - 20:10";

  const animatedSpeed = useSharedValue<number>(0);
  const radius = 90; 
  const strokeWidth = 12; 
  const circumference = 2 * Math.PI * radius; 

  const animatedCircleProps = useAnimatedProps(() => {
    const maxSpeed = 200; 
    const progress = Math.min(animatedSpeed.value / maxSpeed, 1);
    const offset = circumference - progress * circumference;
    return {
      strokeDashoffset: offset,
    };
  });

  // 1. 定位与车速监听 (保留您原有的优秀逻辑)
  useEffect(() => {
    let locationSubscription: Location.LocationSubscription | null = null;

    (async () => {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;

      locationSubscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.BestForNavigation,
          timeInterval: 1000,
          distanceInterval: 1,
        },
        (location) => {
          setMapRegion({
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
            latitudeDelta: currentDeltas.current.latitudeDelta,
            longitudeDelta: currentDeltas.current.longitudeDelta,
          });

          if (location.coords.heading !== null) {
            setHeading(location.coords.heading);
          }

          let currentSpeedMS = location.coords.speed;
          if (currentSpeedMS && currentSpeedMS > 0) {
            let speedKMH = Math.round(currentSpeedMS * 3.6);
            setSpeed(speedKMH);
            animatedSpeed.value = withSpring(speedKMH, { damping: 20, stiffness: 90 });
          } else {
            setSpeed(0);
            animatedSpeed.value = withSpring(0, { damping: 20, stiffness: 90 });
          }
        }
      );
    })();

    return () => {
      if (locationSubscription) locationSubscription.remove();
    };
  }, []);

  // 2. 向您的服务器请求真实车辆数据
  useEffect(() => {
    const fetchTeslaData = async () => {
      try {
        // 请求您自己服务器上的接口 (确保后端已经配置了域名反代，或者直接用 http://IP:3000/api/car_data 测试)
        const response = await fetch('https://dmitt.com/api/car_data');
        
        if (response.status === 401) {
          // 如果服务器返回 401，说明需要登录
          setNeedsLogin(true);
          return;
        }

        const data = await response.json();
        setNeedsLogin(false); // 成功拿到数据，隐藏登录界面

        setGear(data.gear || 'P');
        setBattery(data.battery_level || 0);
        setRange(data.battery_range || 0);

      } catch (error) {
        console.error("获取车辆数据失败 (请检查服务器是否运行):", error);
      }
    };

    fetchTeslaData();
    // 5秒刷新一次，避免被特斯拉接口频繁限流
    const interval = setInterval(fetchTeslaData, 5000); 
    return () => clearInterval(interval);
  }, []);

  // 处理点击登录
  const handleLogin = async () => {
    // 唤起手机内置浏览器，访问您服务器的登录接口
    await WebBrowser.openBrowserAsync('https://dmitt.com/login');
  };

  return (
    <View style={styles.container}>
      <StatusBar hidden={true} />
      
      <MapView
        style={styles.map}
        provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
        customMapStyle={customMapStyle}
        region={mapRegion} 
        showsUserLocation={false} 
        showsMyLocationButton={false} 
        zoomEnabled={true}
        scrollEnabled={true}
        onRegionChangeComplete={(region) => {
          currentDeltas.current = {
            latitudeDelta: region.latitudeDelta,
            longitudeDelta: region.longitudeDelta,
          };
        }}
      >
        <Marker
          coordinate={{ latitude: mapRegion.latitude, longitude: mapRegion.longitude }}
          anchor={{ x: 0.5, y: 0.5 }}
          rotation={heading}
          flat={true}
        >
          <View style={styles.teslaArrowContainer}>
            <Svg width="40" height="40" viewBox="0 0 100 100">
              <Path
                d="M50 5 L95 95 L50 75 L5 95 Z"
                fill="#E82127"
                stroke="#FFFFFF"
                strokeWidth="4"
                strokeLinejoin="round"
              />
            </Svg>
          </View>
        </Marker>
      </MapView>

      <View style={styles.mapOverlay} pointerEvents="none" />

      <View style={styles.contentLayer} pointerEvents="box-none">
        <View style={styles.topBar}>
          <Text style={styles.topBarText}>{dateString}</Text>
        </View>

        <View style={[styles.dashboardWrapper, { 
          left: isLandscape ? 50 : 20, 
          bottom: isLandscape ? 40 : '30%', 
        }]}>
          
          <Svg width="220" height="220" viewBox="0 0 220 220" style={styles.svgRing}>
            <Circle cx="110" cy="110" r={radius} stroke="#1A3314" strokeWidth={strokeWidth} fill="none" />
            <AnimatedCircle cx="110" cy="110" r={radius} stroke="#39FF14" strokeWidth={strokeWidth} fill="none" strokeDasharray={circumference} animatedProps={animatedCircleProps} strokeLinecap="round" rotation="90" origin="110, 110" />
          </Svg>

          <View style={styles.speedTextContainer}>
            <Text style={styles.speedValue}>{speed}</Text>
            <Text style={styles.speedUnit}>KM/H</Text>
          </View>
        </View>

        <View style={[styles.dataPanel, {
          right: isLandscape ? 60 : 20,
          bottom: isLandscape ? 50 : '10%',
        }]}>
          <View style={styles.dataPanelRow}>
            <Text style={styles.dataPanelLabel}>GEAR</Text>
            <Text style={styles.dataPanelValue}>{gear}</Text>
          </View>
          <View style={styles.dataPanelRow}>
            <Text style={styles.dataPanelValue}>{battery}%</Text>
            <Text style={styles.dataIcon}>🔋</Text>
          </View>
          <View style={styles.dataPanelRowFull}>
            <Text style={styles.dataPanelTextFull}>续航 {range} km</Text>
          </View>
        </View>

        {/* 【新增】未登录时的遮罩和登录按钮 */}
        {needsLogin && (
          <View style={styles.loginOverlay}>
            <View style={styles.loginCard}>
              <Text style={styles.loginTitle}>尚未连接到车辆</Text>
              <Text style={styles.loginSubText}>请授权获取车辆实时数据</Text>
              <TouchableOpacity style={styles.loginButton} onPress={handleLogin}>
                <Text style={styles.loginButtonText}>登录 Tesla 账号</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  map: { ...StyleSheet.absoluteFillObject },
  mapOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)' },
  contentLayer: { ...StyleSheet.absoluteFillObject, paddingTop: 10 },
  topBar: { alignItems: 'center', paddingVertical: 10 },
  topBarText: { color: '#FFFFFF', fontSize: 14, fontWeight: 'bold' },
  dashboardWrapper: { position: 'absolute', width: 220, height: 220, justifyContent: 'center', alignItems: 'center', shadowColor: '#39FF14', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.5, shadowRadius: 15, elevation: 10 },
  svgRing: { position: 'absolute' },
  speedTextContainer: { alignItems: 'center', justifyContent: 'center' },
  speedValue: { color: '#FFFFFF', fontSize: 75, fontWeight: '900' },
  speedUnit: { color: '#AAAAAA', fontSize: 16, marginTop: -5 },
  dataPanel: { position: 'absolute', width: 200, backgroundColor: 'rgba(30, 30, 30, 0.8)', borderRadius: 15, padding: 15, borderWidth: 1, borderColor: '#444444' },
  dataPanelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  dataPanelLabel: { color: '#666666', fontSize: 16, fontWeight: 'bold' },
  dataPanelValue: { color: '#FFFFFF', fontSize: 22, fontWeight: 'bold' },
  dataIcon: { fontSize: 28 },
  dataPanelRowFull: { alignItems: 'center', marginTop: 5 },
  dataPanelTextFull: { color: '#AAAAAA', fontSize: 16, fontWeight: 'bold' },
  teslaArrowContainer: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 5, elevation: 8 },
  
  // 【新增】登录界面相关样式
  loginOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', zIndex: 999 },
  loginCard: { backgroundColor: '#1E1E1E', padding: 30, borderRadius: 20, alignItems: 'center', width: '80%', borderWidth: 1, borderColor: '#333' },
  loginTitle: { color: '#FFFFFF', fontSize: 20, fontWeight: 'bold', marginBottom: 10 },
  loginSubText: { color: '#AAAAAA', fontSize: 14, marginBottom: 30, textAlign: 'center' },
  loginButton: { backgroundColor: '#E82127', paddingVertical: 15, paddingHorizontal: 30, borderRadius: 30, width: '100%', alignItems: 'center' },
  loginButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: 'bold' },
});