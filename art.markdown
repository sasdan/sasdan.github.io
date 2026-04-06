---
layout: page
title: Activities
permalink: /art/
---

<div class="filter-bar">
  <span class="filter-btn active" data-filter="all">all</span>
  <span class="filter-btn" data-filter="academic">academic</span>
  <span class="filter-btn" data-filter="outreach">public outreach</span>
  <span class="filter-btn" data-filter="creative">creative</span>
</div>

<ul class="item-list">
{% assign acts = site.activities | sort: "date" | reverse %}
{% for act in acts %}
<li class="item-entry" data-tags="{{ act.type }}">
  <div class="item-thumb">
    {% if act.image %}
      <img src="{{ '/assets/' | append: act.image | relative_url }}" alt="{{ act.title }}">
    {% else %}
      <div class="item-thumb-placeholder">&#9998;</div>
    {% endif %}
  </div>
  <div class="item-info">
    <div class="item-top">
      <span class="item-year">{{ act.date | date: "%Y" }}</span>
      <span class="item-label">{% if act.type == 'academic' %}academic{% elsif act.type == 'outreach' %}public outreach{% else %}{{ act.type }}{% endif %}</span>
    </div>
    <p class="item-title">{{ act.title }}</p>
    <p class="item-meta">{% if act.role %}{{ act.role }}{% endif %}{% if act.venue %}, {{ act.venue }}{% endif %}{% if act.location %}, {{ act.location }}{% endif %}{% if act.external_url %} · <a href="{{ act.external_url }}" class="item-extlink" target="_blank" rel="noopener"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg> link</a>{% endif %}</p>
  </div>
</li>
{% endfor %}
</ul>

<script>
document.querySelectorAll('.filter-btn').forEach(function(btn) {
  btn.addEventListener('click', function() {
    document.querySelectorAll('.filter-btn').forEach(function(b) { b.classList.remove('active'); });
    btn.classList.add('active');
    var f = btn.getAttribute('data-filter');
    document.querySelectorAll('.item-entry').forEach(function(item) {
      if (f === 'all' || item.getAttribute('data-tags') === f) {
        item.classList.remove('hidden');
      } else {
        item.classList.add('hidden');
      }
    });
  });
});
</script>
