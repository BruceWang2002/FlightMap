import os
import requests
from psycopg2.extras import execute_batch
import psycopg2
from datetime import datetime
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# API端点URL


# 区域的地理坐标参数
params = {
    "lamin": 36,
    "lomin": -15,
    "lamax": 62,
    "lomax": 47,
    #"lamin": 36,
    #"lomin": 30,
    #"lamax": 38,
    #"lomax": 32,
}
user_name = os.getenv('OPENSKY_USERNAME')
password = os.getenv('OPENSKY_PASSWORD')
url = 'https://opensky-network.org/api/states/all'
# 连接到PostGIS数据库
def connect_to_db():
    return psycopg2.connect(
        database=os.getenv('POSTGRES_DB', 'gis_test1'),
        user=os.getenv('POSTGRES_USER', 'postgres'),
        password=os.environ['POSTGRES_PASSWORD'],
        host=os.getenv('POSTGRES_HOST', 'localhost'),
        port=os.getenv('POSTGRES_PORT', '5432'),
    )

def ensure_table_exists(cur, table_name):
    # 检查表是否存在
    cur.execute("SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = %s)", (table_name,))
    table_exists = cur.fetchone()[0]

    if not table_exists:
        # 创建表
        create_sql = f"""
        CREATE TABLE "{table_name}" (
            icao24 VARCHAR(18) PRIMARY KEY,
            callsign VARCHAR(18),
            origin_country VARCHAR(36),
            time_position TIMESTAMP,
            last_contact TIMESTAMP,
            longitude FLOAT,
            latitude FLOAT,
            baro_altitude FLOAT,
            on_ground BOOLEAN,
            velocity FLOAT,
            true_track FLOAT,
            vertical_rate FLOAT,
            sensors TEXT[],
            geo_altitude FLOAT,
            squawk VARCHAR(14),
            spi BOOLEAN,
            position_source VARCHAR(20),
            geom GEOMETRY(POINT, 4326)
        )
        """
        cur.execute(create_sql)

def ensure_table_exists2(cur, table_name):
    # 检查表是否存在
    cur.execute("SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = %s)", (table_name,))
    table_exists = cur.fetchone()[0]

    if not table_exists:
        # 创建表
        create_sql = f"""
        CREATE TABLE "{table_name}" (
            id SERIAL PRIMARY KEY,
            callsign VARCHAR(18),
            origin_country VARCHAR(36),
            time_position TIMESTAMP,
            last_contact TIMESTAMP,
            longitude FLOAT,
            latitude FLOAT,
            baro_altitude FLOAT,
            on_ground BOOLEAN,
            velocity FLOAT,
            true_track FLOAT,
            vertical_rate FLOAT,
            sensors TEXT[],
            geo_altitude FLOAT,
            squawk VARCHAR(14),
            spi BOOLEAN,
            position_source VARCHAR(20),
            geom GEOMETRY(POINT, 4326)
        )
        """
        cur.execute(create_sql)

def get_now_plane_and_update():

    try:
        # 发送GET请求
        auth = (user_name, password) if user_name and password else None
        response = requests.get(url, params=params, auth=auth, timeout=20)

        # 检查响应状态码
        if response.status_code == 200:
            # 更新计数器



            # 解析JSON数据
            data = response.json()

            with connect_to_db() as conn:
                with conn.cursor() as cur:
                    # 处理plane_now表
                    ensure_table_exists(cur, 'plane_now')
                    cur.execute("DELETE FROM plane_now")  # 清空表

                    # 构建要插入的数据
                    insert_data = []
                    for state in data["states"]:
                        if state[5] is not None and state[6] is not None:  # 确保经纬度不为空
                            icao24 = state[0]
                            geom = f"SRID=4326;POINT({state[5]} {state[6]})"
                            insert_data.append((icao24, state[1], state[2], state[3], state[4], state[5], state[6], state[7],
                                                state[8], state[9], state[10], state[11], state[12], state[13],
                                                state[14], state[15], state[16], geom))

                    # 批量插入数据到plane_now表
                    insert_sql = """
                    INSERT INTO plane_now (icao24, callsign, origin_country, time_position, last_contact, longitude, latitude, baro_altitude, on_ground, velocity, true_track, vertical_rate, sensors, geo_altitude, squawk, spi, position_source, geom)
                    VALUES (%s, %s, %s, to_timestamp(%s), to_timestamp(%s), %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    """
                    execute_batch(cur, insert_sql, insert_data)
                    conn.commit()

                    # 处理每架飞机的表
                    for state in data["states"]:
                        if state[5] is not None and state[6] is not None:  # 确保经纬度不为空
                            icao24 = state[0]

                            ensure_table_exists2(cur, icao24)

                            # 准备插入数据
                            insert_sql = f"""
                            INSERT INTO "{icao24}" (callsign, origin_country, time_position, last_contact, longitude, latitude, baro_altitude, on_ground, velocity, true_track, vertical_rate, sensors, geo_altitude, squawk, spi, position_source, geom) 
                            VALUES (%s, %s, to_timestamp(%s), to_timestamp(%s), %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                            """
                            geom = f"SRID=4326;POINT({state[5]} {state[6]})"
                            data_to_insert = (state[1], state[2], state[3], state[4], state[5], state[6], state[7], state[8], state[9], state[10], state[11], state[12], state[13], state[14], state[15], state[16], geom)

                            # 插入数据
                            cur.execute(insert_sql, data_to_insert)
                            conn.commit()

                    # 获取当前时间并打印
                    now = datetime.now()
                    current_time = now.strftime("%Y-%m-%d %H:%M:%S")
                    logger.info(f"数据插入成功，当前时间: {current_time}")

        else:
            logger.error("API请求失败: %s", response.status_code)

    except Exception as e:
        logger.error("发生错误: %s", e)
        if 'conn' in locals():  # 只有当conn被定义时才回滚
            conn.rollback()  # 回滚事务

def delete_tables_with_length_6():
    try:
        sql_function = """
        CREATE OR REPLACE FUNCTION delete_tables_with_length_6()
        RETURNS VOID AS $$
        DECLARE
            r RECORD;
        BEGIN
            FOR r IN (SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND CHAR_LENGTH(table_name) = 6)
            LOOP
                EXECUTE 'DROP TABLE IF EXISTS ' || quote_ident(r.table_name) || ' CASCADE;';
            END LOOP;
        END;
        $$ LANGUAGE plpgsql;
        """

        with connect_to_db() as conn:
            with conn.cursor() as cur:
                # 定义 SQL 函数
                cur.execute(sql_function)
                conn.commit()

                # 调用 SQL 函数
                cur.execute("SELECT delete_tables_with_length_6()")
                conn.commit()
                logger.info("已删除长度为6的表格")
    except Exception as e:
        logger.error("删除长度为6的表格时发生错误: %s", e)
        if 'conn' in locals():  # 只有当conn被定义时才回滚
            conn.rollback()  # 回滚事务


if __name__ == '__main__':
    get_now_plane_and_update()
