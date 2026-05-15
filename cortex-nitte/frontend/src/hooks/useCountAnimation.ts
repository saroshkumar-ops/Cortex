import { useEffect, useRef, useState } from 'react'

export function useCountAnimation(target: number, duration = 300): number {
  const [value, setValue] = useState(target)
  const startRef = useRef(target)
  const startTimeRef = useRef(Date.now())

  useEffect(() => {
    startRef.current = value
    startTimeRef.current = Date.now()

    const frame = () => {
      const elapsed = Date.now() - startTimeRef.current
      const progress = Math.min(elapsed / duration, 1)
      const delta = target - startRef.current
      setValue(startRef.current + delta * progress)
      if (progress < 1) requestAnimationFrame(frame)
    }

    requestAnimationFrame(frame)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, duration])

  return value
}
