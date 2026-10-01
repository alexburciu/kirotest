interface FieldErrorProps {
  message?: string
  id?: string
}

export function FieldError({ message, id }: FieldErrorProps) {
  if (!message) return null

  return (
    <p
      id={id}
      role="alert"
      aria-live="polite"
      className="mt-1 text-xs text-red-600"
    >
      {message}
    </p>
  )
}
