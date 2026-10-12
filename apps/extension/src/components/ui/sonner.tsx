import { Toaster as Sonner, type ToasterProps } from "sonner"

import { useColorScheme } from "~lib/use-color-scheme"

// DS: one floating pill at a time, bottom centre; the pill itself is `ToastPill`.
const Toaster = (props: ToasterProps) => {
  const scheme = useColorScheme()

  return (
    <Sonner
      theme={scheme}
      position="bottom-center"
      visibleToasts={1}
      duration={4000}
      offset={16}
      toastOptions={{ unstyled: true, className: "flex w-full justify-center" }}
      {...props}
    />
  )
}

export { Toaster }
