cmake_minimum_required(VERSION 3.24)

project(artss_djs_core VERSION 1.0.0 LANGUAGES CXX)

include(CTest)
find_package(Threads REQUIRED)

add_library(artss_djs_audio STATIC
  modules/artss-audio/cpp/core/AudioEngine.cpp
  modules/artss-audio/cpp/core/DrumSynth.cpp
)
target_compile_features(artss_djs_audio PUBLIC cxx_std_20)
target_include_directories(artss_djs_audio PUBLIC
  "$<BUILD_INTERFACE:${CMAKE_CURRENT_SOURCE_DIR}/modules/artss-audio/cpp/core>"
)
target_link_libraries(artss_djs_audio PUBLIC Threads::Threads)
if(MSVC)
  target_compile_options(artss_djs_audio PRIVATE /W4 /WX)
else()
  target_compile_options(artss_djs_audio PRIVATE -Wall -Wextra -Wpedantic -Werror)
endif()

if(BUILD_TESTING)
  add_executable(artss_djs_audio_tests tests/audio-engine.test.cpp)
  target_link_libraries(artss_djs_audio_tests PRIVATE artss_djs_audio)
  add_test(NAME artss-djs-native-dsp COMMAND artss_djs_audio_tests)
  set_tests_properties(artss-djs-native-dsp PROPERTIES TIMEOUT 90)
endif()
