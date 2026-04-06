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
      {% assign cr = site.data.authors[act.image_copyright] %}{% assign cr_name = nil %}{% if cr.literal %}{% assign cr_name = cr.literal %}{% elsif cr %}{% capture cr_name %}© {{ cr.given }} {{ cr.family }}{% endcapture %}{% endif %}
      <img src="{{ '/assets/' | append: act.image | relative_url }}" alt="{{ act.title | escape }}"{% if cr_name %} title="{{ cr_name }}"{% endif %}>
    {% elsif act.tag and site.data.tags[act.tag].image %}
      <img src="{{ '/assets/' | append: site.data.tags[act.tag].image | relative_url }}" alt="{{ site.data.tags[act.tag].label | escape }}">
    {% else %}
      <div class="item-thumb-placeholder">&#9998;</div>
    {% endif %}
  </div>
  <div class="item-info">
    <div class="item-top">
      <span class="item-year">{{ act.date | date: "%Y" }}</span>
      <span class="item-label">{% if act.type == 'academic' %}academic{% elsif act.type == 'outreach' %}public outreach{% else %}{{ act.type }}{% endif %}</span>
      {% if act.external_url %}<a href="{{ act.external_url }}" class="item-extlink" target="_blank"><i class="icon-external-link"></i> link</a>{% endif %}
    </div>
    <p class="item-title">{{ act.title }}</p>
    {% if act.event or act.venue or act.location %}<p class="item-meta">{{ act.event }}{% if act.event and act.venue %}, {% endif %}{{ act.venue }}{% if act.location and act.event or act.location and act.venue %}, {% endif %}{{ act.location }}</p>{% endif %}
    {% assign stripped_content = act.content | strip_html | strip %}{% if stripped_content != "" %}<p class="item-meta">{{ stripped_content }}</p>{% endif %}
    {% if act.role %}<p class="item-meta item-role">{{ act.role }}</p>{% endif %}
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
