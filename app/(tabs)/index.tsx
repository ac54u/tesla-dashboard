import * as Location from 'expo-location';
import React, { useEffect, useRef, useState } from 'react';
import { Platform, StatusBar, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE, Region } from 'react-native-maps';
import Animated, { useAnimatedProps, useSharedValue, withSpring } from 'react-native-reanimated';
import Svg, { Circle, Path } from 'react-native-svg'; // 【修改】：引入 Path 绘制箭头

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
  const [heading, setHeading] = useState<number>(0); // 【新增】：保存航向角度
  
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

          // 【新增】：更新航向数据
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

  useEffect(() => {
    const fetchTeslaData = async () => {
      try {
        const mockTeslaApiResponse = {
          response: {
            drive_state: { 
              shift_state: speed > 2 ? "D" : "P"
            },
            charge_state: { 
              battery_level: 84, 
              battery_range: 265.5 
            }
          }
        };

        const driveData = mockTeslaApiResponse.response.drive_state;
        const chargeData = mockTeslaApiResponse.response.charge_state;

        setGear(driveData.shift_state || 'P');
        setBattery(chargeData.battery_level);
        setRange(Math.round(chargeData.battery_range * 1.609));
      } catch (error) {
        console.error("获取车辆数据失败:", error);
      }
    };

    fetchTeslaData();
    const interval = setInterval(fetchTeslaData, 3000);
    return () => clearInterval(interval);
  }, [speed]);

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
        {/* 【修改】：复刻图中特斯拉红色箭头图标 */}
        <Marker
          coordinate={{ latitude: mapRegion.latitude, longitude: mapRegion.longitude }}
          anchor={{ x: 0.5, y: 0.5 }}
          rotation={heading} // 让箭头随车头方向旋转
          flat={true} // 让图标贴合地图平面，旋转时更自然
        >
          <View style={styles.teslaArrowContainer}>
            <Svg width="40" height="40" viewBox="0 0 100 100">
              {/* 绘制红色箭头路径 */}
              <Path
                d="M50 5 L95 95 L50 75 L5 95 Z"
                fill="#E82127" // 特斯拉官方红
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
  
  // 【新增】：红色箭头 Marker 的容器样式
  teslaArrowContainer: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    // 给箭头增加一点立体感阴影
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 8,
  },
});