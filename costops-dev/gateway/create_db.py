import asyncpg
import asyncio

async def run():
    conn = await asyncpg.connect('postgresql://postgres:123456@localhost:5432/postgres')
    try:
        await conn.execute('CREATE DATABASE costops_db')
        print("Database 'costops_db' created successfully.")
    except asyncpg.exceptions.DuplicateDatabaseError:
        print("Database 'costops_db' already exists.")
    except Exception as e:
        print(f"Error creating database: {e}")
    finally:
        await conn.close()

if __name__ == "__main__":
    asyncio.run(run())
