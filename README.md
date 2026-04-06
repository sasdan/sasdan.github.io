# saskia.dance

Personal academic website of Saskia Kroonenberg, built with Jekyll.

## Dependencies

| Dependency | Version | License | Usage |
|---|---|---|---|
| [Jekyll](https://jekyllrb.com/) | ~4.4 | MIT | Static site generator |
| [Minima](https://github.com/jekyll/minima) | ~2.5 | MIT | Base theme |
| [jekyll-feed](https://github.com/jekyll/jekyll-feed) | ~0.12 | MIT | RSS feed generation |
| [Lucide Icons](https://lucide.dev/) | 1.7.0 | ISC | Icon font (`assets/fonts/lucide.woff2`) |

## Local development

```sh
bundle install
bundle exec jekyll serve --port 3000 --livereload
```

## Structure

- `_publications/` — Publication collection with CSL-style metadata
- `_activities/` — Activities collection (listing only, no detail pages)
- `_data/authors.yml` — Author index with names and URLs
- `_sass/custom/` — Theme customizations (listing, detail, icons, overrides)
- `_posts/` — Blog posts (News)
