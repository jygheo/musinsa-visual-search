from config.user_agents import USER_AGENTS
import random
def get_random_agent():
    return random.choice(USER_AGENTS)
