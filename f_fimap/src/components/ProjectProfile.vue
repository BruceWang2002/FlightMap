<template>
  <details ref="profile" class="profile" @keydown.esc="closeOnEscape">
    <summary ref="trigger">
      个人信息
      <span class="chevron" aria-hidden="true"></span>
    </summary>
    <div class="profile-card">
      <img :src="photoUrl" alt="项目作者照片" width="96" height="96" loading="lazy" />
      <dl>
        <dt>WhatsApp</dt>
        <dd><a href="https://wa.me/8618813036710" target="_blank" rel="noopener noreferrer">+86 18813036710</a></dd>
        <dt>邮箱</dt>
        <dd><a href="mailto:mengsong3610@gmail.com">mengsong3610@gmail.com</a></dd>
      </dl>
    </div>
  </details>
</template>

<script setup>
import { ref } from 'vue'

defineProps({ photoUrl: { type: String, required: true } })

const profile = ref(null)
const trigger = ref(null)

function closeOnEscape(event) {
  if (!profile.value?.open) return
  event.stopPropagation()
  profile.value.open = false
  trigger.value?.focus()
}
</script>

<style scoped>
.profile {
  position: absolute;
  inset: 10px 12px auto;
  /* Above map controls, below the draggable analysis and weather panels. */
  z-index: 1900;
  pointer-events: none;
  color: var(--text-primary);
  font-size: 14px;
}

summary,
.profile-card {
  pointer-events: auto;
  border: 1px solid var(--border);
  background: var(--surface-panel);
  box-shadow: 0 4px 16px #00152266;
}

summary {
  display: flex;
  align-items: center;
  gap: 10px;
  width: max-content;
  min-height: 40px;
  margin-inline: auto 56px;
  padding: 8px 12px;
  border-radius: var(--radius-control);
  cursor: pointer;
  list-style: none;
}

summary::-webkit-details-marker { display: none; }
summary:focus-visible, a:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.chevron { width: 7px; height: 7px; border: solid currentColor; border-width: 0 2px 2px 0; transform: translateY(-2px) rotate(45deg); }
.profile[open] .chevron { transform: translateY(2px) rotate(225deg); }

.profile-card {
  width: min(100%, 18rem);
  max-height: min(22rem, 52dvh);
  margin: 8px 0 0 auto;
  overflow: auto;
  overscroll-behavior: contain;
  padding: var(--space-panel);
  border-radius: 10px;
}

img { display: block; margin-inline: auto; border: 1px solid var(--border); border-radius: 50%; object-fit: cover; }
dl { margin: 14px 0 0; }
dt { color: var(--text-muted); font-size: 12px; }
dd { margin: 3px 0 9px; }
dd:last-child { margin-bottom: 0; }
a { color: var(--accent); overflow-wrap: anywhere; }
</style>
