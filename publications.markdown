---
layout: page
title: Publications
permalink: /academic/
---

<div class="filter-bar">
  <span class="filter-btn active" data-filter="all">all</span>
  <span class="filter-btn" data-filter="book">book</span>
  <span class="filter-btn" data-filter="article">article</span>
  <span class="filter-btn" data-filter="public">public outreach</span>
  <span class="filter-btn" data-filter="creative">creative</span>
</div>

<ul class="item-list">
{% assign pubs = site.publications | sort: "date" | reverse %}
{% for pub in pubs %}
<li class="item-entry" data-tags="{{ pub.type }}">
  <div class="item-thumb">
    {% if pub.image %}
      <img src="{{ '/assets/' | append: pub.image | relative_url }}" alt="{{ pub.title }}">
    {% else %}
      <div class="item-thumb-placeholder">{% if pub.type == 'book' %}&#9783;{% else %}&#9998;{% endif %}</div>
    {% endif %}
  </div>
  <div class="item-info">
    <div class="item-top">
      <span class="item-year">{{ pub.status | default: pub.date | date: "%Y" }}</span>
      <span class="item-label">{{ pub.type }}</span>
    </div>
    <p class="item-title"><a href="{{ pub.url | relative_url }}">{{ pub.title }}</a></p>
    <p class="item-meta">{% if pub.journal %}<em>{{ pub.journal }}</em>{% endif %}{% if pub.volume %}, {{ pub.volume }}{% endif %}{% if pub.issue %}({{ pub.issue }}){% endif %}{% if pub.pages %}, {{ pub.pages }}{% endif %}{% if pub.publisher %}{{ pub.publisher }}{% endif %}{% if pub.editors %}, ed. {% for eid in pub.editors %}{% include render-name.html id=eid %}{% unless forloop.last %}, {% endunless %}{% endfor %}{% endif %}{% if pub.doi %} · <a href="https://doi.org/{{ pub.doi }}" class="item-extlink" target="_blank" rel="noopener" title="Open DOI in new tab"><i class="icon-external-link"></i> DOI</a>{% endif %}</p>
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
