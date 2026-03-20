import '@testing-library/jest-dom'

function createMemoryStorage(): Storage {
  const store = new Map<string, string>()

  return {
    get length() {
      return store.size
    },
    clear() {
      store.clear()
    },
    getItem(key: string) {
      return store.get(key) ?? null
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null
    },
    removeItem(key: string) {
      store.delete(key)
    },
    setItem(key: string, value: string) {
      store.set(key, String(value))
    },
  }
}

const memoryStorage = createMemoryStorage()

if (
  typeof globalThis.localStorage?.removeItem !== 'function'
) {
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    enumerable: true,
    writable: true,
    value: memoryStorage,
  })
}

if (
  typeof window !== 'undefined' &&
  typeof window.localStorage?.removeItem !== 'function'
) {
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    enumerable: true,
    writable: true,
    value: memoryStorage,
  })
}
