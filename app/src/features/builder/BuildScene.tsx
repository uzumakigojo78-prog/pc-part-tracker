import { Canvas } from '@react-three/fiber'
import { Edges, OrbitControls } from '@react-three/drei'
import type { Box } from './layout'

const COLORS: Record<string, string> = {
  cpu: '#e5484d', cooler: '#3e63dd', motherboard: '#30a46c', ram: '#f5a524',
  gpu: '#8e4ec6', storage: '#12a594', psu: '#ec5b9f', case: '#9aa2b1',
}

export default function BuildScene({ boxes }: { boxes: Box[] }) {
  return (
    <div role="img" aria-label="3D preview of build">
    <Canvas camera={{ position: [50, 25, 70], fov: 40 }} style={{ height: 320, touchAction: 'none' }}>
      <ambientLight intensity={0.8} />
      <directionalLight position={[30, 40, 50]} intensity={1.2} />
      {boxes.map((b, i) => (
        <mesh key={i} position={b.position}>
          <boxGeometry args={b.size} />
          {b.slot === 'case' ? (
            <meshStandardMaterial color={COLORS.case} transparent opacity={0.15} depthWrite={false} />
          ) : b.filled ? (
            <meshStandardMaterial color={COLORS[b.slot]} />
          ) : (
            <>
              <meshBasicMaterial visible={false} />
              <Edges color={COLORS[b.slot]} transparent opacity={0.3} />
            </>
          )}
        </mesh>
      ))}
      <OrbitControls enablePan={false} />
    </Canvas>
    </div>
  )
}
