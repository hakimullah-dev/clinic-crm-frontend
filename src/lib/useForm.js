import { useMemo, useState } from 'react'

const runFieldRules = (value, values, rules = []) => {
  for (const rule of rules) {
    const message = rule(value, values)
    if (message) {
      return message
    }
  }

  return ''
}

export function useForm(initialValues, validationRules = {}) {
  const [values, setValues] = useState(initialValues)
  const [errors, setErrors] = useState({})
  const [touched, setTouched] = useState({})

  const validateField = (name, nextValues = values) => {
    const message = runFieldRules(nextValues[name], nextValues, validationRules[name] || [])
    setErrors((current) => ({ ...current, [name]: message }))
    return !message
  }

  const validateAll = (nextValues = values) => {
    const nextErrors = Object.keys(validationRules).reduce((result, key) => {
      result[key] = runFieldRules(nextValues[key], nextValues, validationRules[key] || [])
      return result
    }, {})

    setErrors(nextErrors)
    return Object.values(nextErrors).every((message) => !message)
  }

  const handleChange = (event) => {
    const { name, value, type, checked } = event.target
    const nextValue = type === 'checkbox' ? checked : value

    setValues((current) => {
      const nextValues = { ...current, [name]: nextValue }
      if (touched[name]) {
        const message = runFieldRules(nextValue, nextValues, validationRules[name] || [])
        setErrors((currentErrors) => ({ ...currentErrors, [name]: message }))
      }
      return nextValues
    })
  }

  const handleBlur = (event) => {
    const { name } = event.target
    setTouched((current) => ({ ...current, [name]: true }))
    validateField(name)
  }

  const handleSubmit = (onSubmit) => (event) => {
    event.preventDefault()
    setTouched(
      Object.keys(validationRules).reduce((result, key) => {
        result[key] = true
        return result
      }, {}),
    )

    if (validateAll()) {
      onSubmit(values, event)
    }
  }

  const reset = (nextValues = initialValues) => {
    setValues(nextValues)
    setErrors({})
    setTouched({})
  }

  const isValid = useMemo(
    () => Object.values(errors).every((message) => !message),
    [errors],
  )

  return {
    values,
    errors,
    handleChange,
    handleBlur,
    handleSubmit,
    isValid,
    reset,
    setValues,
    setErrors,
    validateAll,
  }
}
