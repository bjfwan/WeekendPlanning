<script setup lang="ts">
/** 通用输入框组件，支持 v-model */
interface Props {
  modelValue: string | number
  label?: string
  placeholder?: string
  error?: string
  type?: string
  required?: boolean
  min?: string | number
  max?: string | number
}

withDefaults(defineProps<Props>(), {
  type: 'text',
  required: false
})

defineEmits<{
  'update:modelValue': [value: string]
}>()
</script>

<template>
  <div class="w-full">
    <label
      v-if="label"
      class="block mb-2 text-sm font-semibold text-navy"
    >
      {{ label }}
      <span v-if="required" class="text-coral">*</span>
    </label>
    <input
      :type="type"
      :value="modelValue"
      :placeholder="placeholder"
      :required="required"
      :min="min"
      :max="max"
      @input="$emit('update:modelValue', ($event.target as HTMLInputElement).value)"
      :class="[
        'w-full px-4 py-3 rounded-xl bg-white border-2 transition-all duration-200 outline-none',
        'placeholder:text-navy/30 text-navy',
        'focus:border-coral focus:ring-4 focus:ring-coral/15',
        error
          ? 'border-red-400 focus:border-red-400 focus:ring-red-100'
          : 'border-navy/10 hover:border-navy/20'
      ]"
    />
    <p v-if="error" class="mt-1.5 text-sm text-red-500">{{ error }}</p>
  </div>
</template>
