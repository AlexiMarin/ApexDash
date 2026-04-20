import SideViewCar from './SideViewCar'

export default function RightView(props: Omit<React.ComponentProps<typeof SideViewCar>, 'side'>) {
  return <SideViewCar side="R" {...props} />
}
