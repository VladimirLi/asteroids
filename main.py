import sys

import pygame
from pygame import display

from asteroid import Asteroid
from asteroidfield import AsteroidField
from constants import SCREEN_HEIGHT, SCREEN_WIDTH
from logger import log_event, log_state
from player import Player
from shot import Shot


def main():
    pygame.init()
    screen = pygame.display.set_mode((SCREEN_WIDTH, SCREEN_HEIGHT))
    clock = pygame.time.Clock()
    dt = 0

    updatable = pygame.sprite.Group()
    drawable = pygame.sprite.Group()
    asteroids = pygame.sprite.Group()
    shots = pygame.sprite.Group()

    Player.containers = (updatable, drawable)
    Asteroid.containers = (asteroids, updatable, drawable)
    AsteroidField.containers = updatable
    Shot.containers = (shots, drawable, updatable)

    player = Player(SCREEN_WIDTH / 2, SCREEN_HEIGHT / 2)
    AsteroidField()

    while True:
        log_state()
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                return
        # game state update
        updatable.update(dt)

        # player asteroid collision check
        for asteroid in asteroids:
            if not player.collides_with(asteroid):
                continue
            log_event("player_hit")
            print("Game over!")
            sys.exit()

        # shot asteroid collision check
        for asteroid in asteroids:
            for shot in shots:
                if not asteroid.collides_with(shot):
                    continue
                log_event("asteroid_shot")
                asteroid.split()
                shot.kill()

        # rendering
        screen.fill("black")
        for thing in drawable:
            thing.draw(screen)
        display.flip()

        dt_ms = clock.tick(60)
        dt = dt_ms / 1000


if __name__ == "__main__":
    main()
