# Product

<!-- impeccable:product-schema 1 -->

## Platform

adaptive: one TypeScript web codebase that runs in mobile browsers, on desktop, and inside a Capacitor Android (later iOS) app. Primary device: a modern Android phone held in portrait.

## Stack

TypeScript + Vite, Canvas 2D for the match, plain DOM/CSS for menus. Capacitor for the native wrapper. No game engine.

## Users

Fans of esports-manager games (team management + auto-battle MOBA matches) who play on a phone in short sessions. The project owner, Alexander, is the first player; he writes in Russian, so the UI language is Russian.

## Product Purpose

An original esports team manager: sign and train a five-player roster, draft heroes against a rival in a pick/ban phase, then watch an auto-simulated top-down 5v5 match and climb a weekly league. Success: a season is fun to play on a phone without the device heating up.

## Positioning

A native-feeling, lightweight phone game in the genre, built from scratch. It exists because running a PC game in the genre through emulation overheats the phone.

## Constraints

- Fully original: no names, characters, art, UI, music or rules copied from any existing game (inferred from the project brief; confirmed by the owner's request for "our own game").
- Phone heat budget: cap rendering at 30 fps, stop drawing when hidden, avoid heavy effects.
- Single-player first; an online mode comes later.
- Draft follows the pick/ban order players know from competitive MOBA play (owner's request, 2026-11-06).

## Open decisions

- Final game name (working title: «Арена Менеджер»).
