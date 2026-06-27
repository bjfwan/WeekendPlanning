/**
 * 表单验证 composable
 * 支持字段级验证规则、失焦触发验证、输入时清除错误、提交时全量验证
 */
import { reactive } from 'vue'

/** 验证规则类型 */
export type ValidationRule =
  | { type: 'required'; message: string }
  | { type: 'min'; value: number; message: string }
  | { type: 'max'; value: number; message: string }
  | { type: 'pattern'; regex: RegExp; message: string }
  | { type: 'custom'; validator: (value: unknown) => boolean; message: string }

/** 字段规则集合 */
export type FieldRules = ValidationRule[]

export interface UseFormValidationReturn<T> {
  /** 各字段的错误信息 */
  errors: Record<keyof T, string>
  /** 验证单个字段 */
  validateField: (field: keyof T, value: unknown) => boolean
  /** 验证所有字段 */
  validateAll: (values: T) => boolean
  /** 清除指定字段错误 */
  clearError: (field: keyof T) => void
  /** 是否存在任何错误 */
  hasErrors: () => boolean
}

/**
 * 应用单条验证规则
 */
function applyRule(rule: ValidationRule, value: unknown): boolean {
  switch (rule.type) {
    case 'required':
      if (typeof value === 'string') return value.trim().length > 0
      if (Array.isArray(value)) return value.length > 0
      if (typeof value === 'number') return !isNaN(value)
      return value !== null && value !== undefined
    case 'min':
      return Number(value) >= rule.value
    case 'max':
      return Number(value) <= rule.value
    case 'pattern':
      return rule.regex.test(String(value))
    case 'custom':
      return rule.validator(value)
    default:
      return true
  }
}

/**
 * 表单验证 composable
 * @param fields 各字段的验证规则映射
 */
export function useFormValidation<T extends Record<string, unknown>>(
  fields: { [K in keyof T]?: FieldRules }
): UseFormValidationReturn<T> {
  const errors = reactive({}) as Record<keyof T, string>

  // 初始化所有错误为空字符串
  for (const key in fields) {
    errors[key] = ''
  }

  /** 验证单个字段，返回是否通过 */
  function validateField(field: keyof T, value: unknown): boolean {
    const rules = fields[field]
    if (!rules || rules.length === 0) {
      errors[field] = ''
      return true
    }
    for (const rule of rules) {
      const ok = applyRule(rule, value)
      if (!ok) {
        errors[field] = rule.message
        return false
      }
    }
    errors[field] = ''
    return true
  }

  /** 验证所有字段，返回是否全部通过 */
  function validateAll(values: T): boolean {
    let allValid = true
    for (const key in fields) {
      const ok = validateField(key, values[key])
      if (!ok) allValid = false
    }
    return allValid
  }

  /** 清除指定字段的错误 */
  function clearError(field: keyof T): void {
    errors[field] = ''
  }

  /** 是否存在任何错误 */
  function hasErrors(): boolean {
    return Object.values(errors).some((e) => !!e)
  }

  return { errors, validateField, validateAll, clearError, hasErrors }
}
