Pod::Spec.new do |s|
  s.name           = 'ThemeCrossfade'
  s.version        = '1.0.0'
  s.summary        = 'Crossfades the whole window, sheets included, over a Theme change.'
  s.description    = s.summary
  s.license        = 'MIT'
  s.author         = 'WhoCards'
  s.homepage       = 'https://whocards.cc'
  s.platforms      = { :ios => '15.1' }
  s.source         = { git: '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files = '**/*.swift'
end
