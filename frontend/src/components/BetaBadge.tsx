export default function BetaBadge() {
  return (
    <span style={{
      position: 'absolute', top: 4, left: 4, zIndex: 1,
      fontSize: 7, fontWeight: 700, letterSpacing: '0.06em',
      color: '#000', background: '#facc15',
      borderRadius: 3, padding: '1px 4px', lineHeight: 1.3,
    }}>BETA</span>
  )
}
