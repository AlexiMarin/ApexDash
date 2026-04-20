import SideViewCar from './SideViewCar'

export default function LeftView(props: Omit<React.ComponentProps<typeof SideViewCar>, 'side'>) {
  return <SideViewCar side="L" {...props} />
}
